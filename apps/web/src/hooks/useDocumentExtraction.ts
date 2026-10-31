import { useCallback, useEffect, useState } from 'react';
import { extractionResponse, type ExtractionResponse } from '../contracts';
import { apiUpload } from '../lib/apiClient';
import { attempt, type ApiFailure } from '../lib/apiErrors';
import { checkDocument } from '../lib/documentChecks';

export type ExtractionStatus = 'reading' | 'ready' | 'failed';

interface ExtractionState {
  status: ExtractionStatus;
  result: ExtractionResponse | null;
  failure: ApiFailure | null;
}

const READING: ExtractionState = { status: 'reading', result: null, failure: null };

/**
 * Sends a bill's PDF to be read and returns what could be found. The file is checked here first, so an
 * obviously wrong file never leaves the browser; the request is dropped if the review is closed meanwhile.
 */
export function useDocumentExtraction(file: File, phaseId: string | undefined) {
  const [state, setState] = useState<ExtractionState>(READING);
  const [attemptNumber, setAttemptNumber] = useState(0);

  useEffect(() => {
    const refused = checkDocument(file);
    if (refused) {
      setState({ status: 'failed', result: null, failure: { kind: 'document', code: refused, message: refused } });
      return;
    }

    const controller = new AbortController();
    setState(READING);
    const query = phaseId ? `?phaseId=${encodeURIComponent(phaseId)}` : '';
    void (async () => {
      const outcome = await attempt(() =>
        apiUpload(`/api/documents/extract${query}`, file, 'application/pdf', extractionResponse, { signal: controller.signal })
      );
      if (controller.signal.aborted) return;
      setState(outcome.ok ? { status: 'ready', result: outcome.value, failure: null } : { status: 'failed', result: null, failure: outcome.failure });
    })();
    return () => controller.abort();
  }, [file, phaseId, attemptNumber]);

  const retry = useCallback(() => setAttemptNumber((count) => count + 1), []);
  return { ...state, retry };
}
