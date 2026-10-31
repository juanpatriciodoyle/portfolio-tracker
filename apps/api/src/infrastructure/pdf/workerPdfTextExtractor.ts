import { pathToFileURL } from 'url';
import { Worker } from 'worker_threads';
import { DocumentRejectedError, type DocumentRejection } from '../../application/errors';
import type { PdfTextExtractor } from '../../application/ports';
import { MAX_DOCUMENT_PAGES } from '../../contracts/document';

/**
 * The reader runs in its own thread so a hostile or broken PDF can only hang or crash that thread, which is stopped
 * after a time limit and capped in memory. It receives a copy of the bytes in memory and writes nothing to disk.
 * The source is inline so it ships with the compiled server without an extra file to copy.
 */
const READER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
(async () => {
  try {
    const pdfjs = await import(workerData.pdfjsUrl);
    const task = pdfjs.getDocument({
      data: new Uint8Array(workerData.pdf),
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
      verbosity: 0,
    });
    const document = await task.promise;
    if (document.numPages > workerData.maxPages) {
      parentPort.postMessage({ ok: false, code: 'TOO_MANY_PAGES' });
      return;
    }
    const pages = [];
    for (let number = 1; number <= document.numPages; number++) {
      const content = await (await document.getPage(number)).getTextContent();
      let line = '';
      let lastY = null;
      const lines = [];
      for (const item of content.items) {
        if (typeof item.str !== 'string') continue;
        const y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 2) { lines.push(line); line = ''; }
        line += (line && item.str && !line.endsWith(' ') && !item.str.startsWith(' ') ? ' ' : '') + item.str;
        lastY = y;
        if (item.hasEOL) { lines.push(line); line = ''; lastY = null; }
      }
      if (line) lines.push(line);
      pages.push(lines.join('\\n'));
    }
    parentPort.postMessage({ ok: true, pages: document.numPages, text: pages.join('\\n') });
  } catch {
    parentPort.postMessage({ ok: false, code: 'UNREADABLE_DOCUMENT' });
  }
})();
`;

export interface WorkerPdfTextExtractorOptions {
  readonly maxPages?: number;
  readonly timeoutMs?: number;
  readonly maxMemoryMb?: number;
  /** Replaces the reader (tests use it to simulate a reader that hangs or crashes). */
  readonly workerSource?: string;
}

type ReaderMessage = { ok: true; pages: number; text: string } | { ok: false; code: DocumentRejection };

export class WorkerPdfTextExtractor implements PdfTextExtractor {
  private readonly maxPages: number;
  private readonly timeoutMs: number;
  private readonly maxMemoryMb: number;
  private readonly source: string;

  constructor({ maxPages = MAX_DOCUMENT_PAGES, timeoutMs = 10_000, maxMemoryMb = 256, workerSource = READER_SOURCE }: WorkerPdfTextExtractorOptions = {}) {
    this.maxPages = maxPages;
    this.timeoutMs = timeoutMs;
    this.maxMemoryMb = maxMemoryMb;
    this.source = workerSource;
  }

  extract(pdf: Uint8Array): Promise<{ pages: number; text: string }> {
    return new Promise((resolve, reject) => {
      const bytes = new Uint8Array(pdf).buffer; // a copy handed over to the thread: the caller keeps its own bytes
      const worker = new Worker(this.source, {
        eval: true,
        workerData: { pdf: bytes, maxPages: this.maxPages, pdfjsUrl: pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href },
        transferList: [bytes],
        resourceLimits: { maxOldGenerationSizeMb: this.maxMemoryMb },
        env: {},
        stdout: true,
        stderr: true,
      });

      let settled = false;
      const finish = (outcome: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        outcome();
      };
      const timer = setTimeout(() => finish(() => reject(new DocumentRejectedError('UNREADABLE_DOCUMENT'))), this.timeoutMs);

      worker.on('message', (message: ReaderMessage) =>
        finish(() => (message.ok ? resolve({ pages: message.pages, text: message.text }) : reject(new DocumentRejectedError(message.code))))
      );
      worker.on('error', () => finish(() => reject(new DocumentRejectedError('UNREADABLE_DOCUMENT'))));
      worker.on('exit', () => finish(() => reject(new DocumentRejectedError('UNREADABLE_DOCUMENT'))));
    });
  }
}
