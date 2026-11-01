import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { CreateBillingRecordRequest, ExtractionResponse, LivingPhaseDto, VendorHistoryEntry } from '../../contracts';
import { useDocumentExtraction } from '../../hooks/useDocumentExtraction';
import type { MutationResult } from '../../lib/apiErrors';
import BillFields from './BillFields';
import type { BillFormContext } from './billForm';
import { describeDocumentFailure } from './describeDocument';
import { blankFields, reviewFormFrom, validateReview, type ReviewErrors, type ReviewForm } from './documentForm';

interface DocumentReviewModalProps {
  /** The PDFs the person picked, reviewed one after another. They stay in the browser: only the text is read on the server, and nothing is kept. */
  files: readonly File[];
  phases: readonly LivingPhaseDto[];
  /** Today as the server sees it, and the senders the person already has: they help fill in what a document did not say. */
  today: string | null;
  history: readonly VendorHistoryEntry[];
  /** The phase the person was looking at; used when the bill's dates point to no phase. */
  openedFromPhaseId: string;
  onSave: (request: CreateBillingRecordRequest) => Promise<MutationResult<unknown>>;
  onClose: () => void;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** A browser-held copy of the file for the preview, released as soon as the review closes. */
function usePreviewUrl(file: File): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const created = URL.createObjectURL(file);
    setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [file]);
  return url;
}

interface ReviewFormPanelProps {
  extraction: ExtractionResponse;
  phases: readonly LivingPhaseDto[];
  openedFromPhaseId: string;
  today: string | null;
  history: readonly VendorHistoryEntry[];
  /** True when more PDFs wait behind this one. */
  hasNext: boolean;
  onSave: DocumentReviewModalProps['onSave'];
  /** The bill was logged: on to the next PDF, or done. */
  onSaved: () => void;
  /** Leave this PDF unlogged and move on. */
  onSkip: () => void;
  onClose: () => void;
}

function ReviewFormPanel({ extraction, phases, openedFromPhaseId, today, history, hasNext, onSave, onSaved, onSkip, onClose }: ReviewFormPanelProps) {
  const id = useId();
  const { draft, textFound, suggestedPhaseId } = extraction;
  const initialPhase = phases.find((phase) => phase.id === suggestedPhaseId) ?? phases.find((phase) => phase.id === openedFromPhaseId) ?? phases[0];
  const [phaseId, setPhaseId] = useState(initialPhase.id);
  const [form, setForm] = useState<ReviewForm>(() =>
    reviewFormFrom(draft, initialPhase.currency, { today, countryCode: initialPhase.countryCode, history })
  );
  const [errors, setErrors] = useState<ReviewErrors>({});
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const blanks = blankFields(draft);

  const phase = phases.find((candidate) => candidate.id === phaseId) ?? initialPhase;
  const currencyDiffers = draft.currency !== null && draft.currency !== phase.currency;
  const context: BillFormContext = { today, countryCode: phase.countryCode, history };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    const result = validateReview(form, phase.id, phase.currency);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    setErrors({});
    submitting.current = true;
    setSaving(true);
    const saved = await onSave(result.create);
    submitting.current = false;
    setSaving(false);
    if (saved.ok) onSaved();
    else setErrors({ form: describeDocumentFailure(saved.failure) });
  };

  return (
    <form className="document-review__form cost-editor" onSubmit={handleSubmit} noValidate aria-label="Review the bill">
      {!textFound && (
        <p className="document-review__notice" role="status">
          This PDF has no readable text (probably a scan). Fill the details in yourself.
        </p>
      )}

      <div className="form-group">
        <label className="form-label" htmlFor={`${id}-phase`}>
          Which home is this bill for?
        </label>
        <select id={`${id}-phase`} className="form-input" value={phase.id} onChange={(event) => setPhaseId(event.target.value)}>
          {phases.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name} ({candidate.currency})
            </option>
          ))}
        </select>
      </div>

      {currencyDiffers && (
        <p className="document-review__notice is-warning" role="alert">
          The bill says {draft.currency}, but {phase.name} uses {phase.currency}. Nothing is converted: check the amount, or pick the home that matches.
        </p>
      )}

      <BillFields id={id} form={form} update={(change) => setForm(change)} context={context} errors={errors} blanks={blanks} />

      {errors.form && (
        <p className="form-error-text" role="alert">
          {errors.form}
        </p>
      )}

      <div className="cost-editor__actions">
        <button type="submit" className="btn-primary-apply" disabled={saving}>
          {saving ? 'Saving…' : hasNext ? 'Log bill and next' : 'Log bill'}
        </button>
        {hasNext && (
          <button type="button" className="btn-secondary-cancel" onClick={onSkip} disabled={saving}>
            Skip this one
          </button>
        )}
        <button type="button" className="btn-secondary-cancel" onClick={onClose}>
          {hasNext ? 'Stop here' : 'Cancel'}
        </button>
      </div>
    </form>
  );
}

/** Reads each bill's PDF in turn and lets the person check it, fill in what could not be read, and log it. */
export default function DocumentReviewModal({ files, phases, today, history, openedFromPhaseId, onSave, onClose }: DocumentReviewModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const file = files[index];
  const hasNext = index < files.length - 1;
  const previewUrl = usePreviewUrl(file);
  const extraction = useDocumentExtraction(file, openedFromPhaseId);
  const next = () => (hasNext ? setIndex(index + 1) : onClose());

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    return () => opener?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;

    const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panelRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // Rendered on the page itself, not inside the phase card: a collapsed card is transparent and would hide it.
  return createPortal(
    <div className="document-review" onKeyDown={handleKeyDown}>
      <div className="document-review__backdrop" onClick={onClose} aria-hidden="true" />
      <div ref={panelRef} className="document-review__panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="document-review__heading">
          <h2 className="document-review__title" id={titleId}>
            {files.length > 1 ? 'Add bills from PDFs' : 'Add a bill from a PDF'}
          </h2>
          {files.length > 1 && (
            <p className="document-review__progress" role="status">
              Bill {index + 1} of {files.length} · {file.name}
            </p>
          )}
        </div>

        <div className="document-review__body">
          {previewUrl && (
            <object className="document-review__preview" data={previewUrl} type="application/pdf" aria-label="Preview of your PDF">
              <p className="document-review__notice">Your browser cannot show this PDF here, but the details can still be read.</p>
            </object>
          )}

          {extraction.status === 'reading' && (
            <p className="document-review__notice" role="status">
              Reading your bill…
            </p>
          )}

          {extraction.status === 'failed' && extraction.failure && (
            <div className="document-review__form">
              <p className="form-error-text" role="alert">
                {describeDocumentFailure(extraction.failure)}
              </p>
              <div className="cost-editor__actions">
                <button type="button" className="btn-primary-apply" onClick={extraction.retry}>
                  Try again
                </button>
                {hasNext && (
                  <button type="button" className="btn-secondary-cancel" onClick={next}>
                    Skip this one
                  </button>
                )}
                <button type="button" className="btn-secondary-cancel" onClick={onClose}>
                  Close
                </button>
              </div>
            </div>
          )}

          {extraction.status === 'ready' && extraction.result && (
            <ReviewFormPanel
              key={index}
              extraction={extraction.result}
              phases={phases}
              openedFromPhaseId={openedFromPhaseId}
              today={today}
              history={history}
              hasNext={hasNext}
              onSave={onSave}
              onSaved={next}
              onSkip={next}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
