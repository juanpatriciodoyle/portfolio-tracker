import { MAX_DOCUMENT_BYTES, type CalendarDate, type ExtractionResponse } from '../contracts';
import { phaseForBill } from '../domain/phaseForBill';
import { extractBillingDraft } from '../domain/documentExtraction/extractBillingDraft';
import { DocumentRejectedError, ResourceNotFoundError } from './errors';
import type { ConcurrencyGate, SlidingWindowRateLimiter } from './limits';
import type { LivingPhaseService } from './livingPhaseService';
import type { PdfTextExtractor } from './ports';

export interface DocumentExtractionServiceDeps {
  readonly extractor: PdfTextExtractor;
  readonly phases: LivingPhaseService;
  readonly limiter: SlidingWindowRateLimiter;
  readonly gate: ConcurrencyGate;
}

const PDF_MAGIC = Buffer.from('%PDF-');
/** Some generators put a few bytes before the header; the specification allows it. */
const MAGIC_SEARCH_BYTES = 1024;

/**
 * Reads a bill PDF entirely in memory and answers with what it could read. The document is never written
 * anywhere and nothing from it is kept: only the typed draft goes back. Nothing here persists.
 */
export class DocumentExtractionService {
  private readonly extractor: PdfTextExtractor;
  private readonly phases: LivingPhaseService;
  private readonly limiter: SlidingWindowRateLimiter;
  private readonly gate: ConcurrencyGate;

  constructor({ extractor, phases, limiter, gate }: DocumentExtractionServiceDeps) {
    this.extractor = extractor;
    this.phases = phases;
    this.limiter = limiter;
    this.gate = gate;
  }

  async extract(userId: string, pdf: Uint8Array, { phaseId, asOf }: { phaseId?: string; asOf: CalendarDate }): Promise<ExtractionResponse> {
    const decision = this.limiter.tryAcquire(userId);
    if (!decision.allowed) throw new DocumentRejectedError('RATE_LIMITED', decision.retryAfterSeconds);

    if (pdf.byteLength > MAX_DOCUMENT_BYTES) throw new DocumentRejectedError('DOCUMENT_TOO_LARGE');
    if (!Buffer.from(pdf.subarray(0, MAGIC_SEARCH_BYTES)).includes(PDF_MAGIC)) throw new DocumentRejectedError('NOT_A_PDF');

    const loaded = await this.phases.loadPhases(userId);
    const spans = loaded.map(({ dto }) => ({ id: dto.id, startDate: dto.startDate, endDate: dto.endDate ?? null }));
    const hintPhaseId = phaseId ?? phaseForBill(spans, null, asOf);
    const hintPhase = loaded.find(({ dto }) => dto.id === hintPhaseId)?.dto;
    if (phaseId !== undefined && !hintPhase) throw new ResourceNotFoundError('living phase');

    const { pages, text } = await this.read(pdf);
    const { draft, textFound } = extractBillingDraft(text, { countryCode: hintPhase?.countryCode, currency: hintPhase?.currency });

    return { draft, textFound, pages, suggestedPhaseId: phaseForBill(spans, draft.periodStart, asOf) ?? hintPhase?.id ?? null };
  }

  private async read(pdf: Uint8Array): Promise<{ pages: number; text: string }> {
    const leave = this.gate.tryEnter();
    if (!leave) throw new DocumentRejectedError('EXTRACTION_BUSY');
    try {
      return await this.extractor.extract(pdf);
    } catch (error) {
      // What went wrong inside the reader may mention paths or content: only the kind of failure goes out.
      throw error instanceof DocumentRejectedError ? error : new DocumentRejectedError('UNREADABLE_DOCUMENT');
    } finally {
      leave();
    }
  }
}
