import { useTranslation } from '../../i18n/useTranslation';
import { CalendarX, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { incomeGaps, type IncomeEndReason, type IncomeStreamDto, type LivingPhaseDto, type UpdateLivingPhaseRequest } from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import { useSubmitOnce } from '../../hooks/useSubmitOnce';
import { clampDateYear } from '../../lib/inputFilters';
import { formatCalendarDate, formatMinor } from '../../lib/money';
import { describeFailure } from './failureMessage';
import IncomeStreamEditor from './IncomeStreamEditor';
import { endReasonOptions, describeIncomeEnd, describeIncomeStream, endJob, groupIncome, reopenJob, type IncomeRow } from './incomeForm';
import SegmentedChoice from './SegmentedChoice';

interface IncomeSectionProps {
  phase: LivingPhaseDto;
  /** Today, from the server's clock: what is "paying now" and what has "ended". */
  asOf?: string;
  /** Counts the presses of an "Add job" button outside the list: each one opens the form to add a job. */
  addRequests?: number;
  onUpdatePhase: (phaseId: string, input: UpdateLivingPhaseRequest) => Promise<MutationResult<unknown>>;
  announce: (message: string) => void;
}

type Editing = { mode: 'add' } | { mode: 'edit'; index: number } | null;
type Ending = { index: number; lastDay: string; reason: IncomeEndReason | ''; error: string | null } | null;

const byStart = (a: IncomeStreamDto, b: IncomeStreamDto) =>
  a.startDate.localeCompare(b.startDate) || (a.endDate ?? '').localeCompare(b.endDate ?? '') || a.label.localeCompare(b.label);

/** Every job and source of income during a home. Each is its own line: end one and the others carry on. */
export default function IncomeSection({ phase, asOf, addRequests = 0, onUpdatePhase, announce }: IncomeSectionProps) {
  const words = useTranslation();
  const { t } = words;
  const id = useId();
  const [editing, setEditing] = useState<Editing>(null);
  const [ending, setEnding] = useState<Ending>(null);
  const [confirmingIndex, setConfirmingIndex] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  /** Removing, ending or reviving a job: one at a time, however fast the button is tapped. */
  const { run: runIncomeAction, pending: incomeBusy } = useSubmitOnce();

  // Each new request to add a job (the card's "Add job" button) opens the add form: state adjusted while rendering, not in an effect.
  const [seenAddRequests, setSeenAddRequests] = useState(0);
  if (addRequests !== seenAddRequests) {
    setSeenAddRequests(addRequests);
    if (addRequests > 0) setEditing({ mode: 'add' });
  }

  const streams = [...phase.incomeStreams].sort(byStart);
  const groups = groupIncome(streams, asOf, phase);
  const populatedGroups = [groups.paying, groups.ended, groups.oneTime].filter((rows) => rows.length > 0).length;
  const gaps = asOf ? incomeGaps({ startDate: phase.startDate, endDate: phase.endDate, streams }, asOf) : [];

  const save = async (next: readonly IncomeStreamDto[], message: string) => {
    const result = await onUpdatePhase(phase.id, { incomeStreams: [...next].sort(byStart) });
    if (result.ok) {
      setEditing(null);
      setEnding(null);
      setConfirmingIndex(null);
      setRemoveError(null);
      announce(message);
    }
    return result;
  };

  const replaceAt = (index: number, stream: IncomeStreamDto) => streams.map((existing, position) => (position === index ? stream : existing));

  const submit = (stream: IncomeStreamDto) =>
    editing?.mode === 'edit' ? save(replaceAt(editing.index, stream), t('income.updated')) : save([...streams, stream], t('income.added'));

  const remove = (index: number) =>
    runIncomeAction(async () => {
      const result = await save(
        streams.filter((_, position) => position !== index),
        t('income.removed')
      );
      if (!result.ok) setRemoveError(describeFailure(result.failure, [], words));
    });

  const startEnding = (index: number) => {
    const first = streams[index].startDate;
    const today = asOf ?? first;
    // The last day defaults to today, kept inside the job's own days and the home's.
    const lastDay = [today, first].sort().pop()!;
    setEnding({ index, lastDay: phase.endDate !== null && lastDay > phase.endDate ? phase.endDate : lastDay, reason: '', error: null });
    setEditing(null);
    setConfirmingIndex(null);
  };

  const confirmEnding = async () => {
    if (ending === null) return;
    const result = endJob(streams[ending.index], ending.lastDay, ending.reason, phase, t);
    if (!result.ok) {
      setEnding({ ...ending, error: result.error });
      return;
    }
    await runIncomeAction(async () => {
      const saved = await save(replaceAt(ending.index, result.stream), t('income.jobEnded'));
      if (!saved.ok) setEnding({ ...ending, error: describeFailure(saved.failure, [], words) });
    });
  };

  const bringBack = (index: number) =>
    runIncomeAction(async () => {
      const result = await save(replaceAt(index, reopenJob(streams[index])), t('income.payingAgain'));
      if (!result.ok) setRemoveError(describeFailure(result.failure, [], words));
    });

  const renderRow = ({ stream, index, lastDay, endsWithHome }: IncomeRow, isEnded: boolean) => {
    // A job without an end date in a home that is over stopped the day the home did: show it that way.
    const shown = { ...stream, endDate: lastDay };
    const when = describeIncomeStream(shown, undefined, t);
    const endNote = describeIncomeEnd(shown, undefined, t, endsWithHome);
    const name = `${stream.label} ${when}`;
    const oneTime = stream.kind === 'ONE_TIME';
    return (
      <li key={`${stream.startDate}-${stream.label}-${index}`} className={`cost-row income-row${isEnded ? ' is-ended' : ''}`}>
        {editing?.mode === 'edit' && editing.index === index ? (
          <IncomeStreamEditor phase={phase} initial={stream} onSubmit={submit} onCancel={() => setEditing(null)} />
        ) : (
          <>
            <div className="cost-row__main">
              <span className="bill-row__text">
                <span className="cost-row__name">{stream.label}</span>
                <span className="bill-row__period">{when}</span>
                {endNote && <span className="income-row__end">{endNote}</span>}
              </span>
            </div>
            <span className="cost-row__amount">
              {formatMinor(stream.amountMinor, phase.currency)} <span className="cost-row__cadence">{oneTime ? t('income.once') : t('label.cadencePhrase.MONTHLY')}</span>
            </span>
            {confirmingIndex === index ? (
              <div className="confirm-inline" role="group" aria-label={t('ledger.confirmRemoving', { name })}>
                <span>{t('income.removeQuestion')}</span>
                <button type="button" className="profile-danger-button" disabled={incomeBusy} aria-busy={incomeBusy} onClick={() => remove(index)}>
                  {t('ledger.remove')}
                </button>
                <button type="button" className="profile-text-button" onClick={() => setConfirmingIndex(null)}>
                  {t('ledger.keep')}
                </button>
              </div>
            ) : (
              <div className="cost-row__actions">
                {!oneTime && !isEnded && stream.endDate === null && (
                  <button type="button" className="profile-icon-button" aria-label={t('income.endJobNamed', { name })} title={t('income.endJob')} onClick={() => startEnding(index)}>
                    <CalendarX size={14} aria-hidden="true" />
                  </button>
                )}
                {isEnded && !endsWithHome && (
                  <button type="button" className="profile-icon-button" aria-label={t('income.bringBackNamed', { name })} title={t('income.bringBack')} disabled={incomeBusy} aria-busy={incomeBusy} onClick={() => bringBack(index)}>
                    <RotateCcw size={14} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  className="profile-icon-button"
                  aria-label={t('ledger.edit', { name })}
                  onClick={() => {
                    setEditing({ mode: 'edit', index });
                    setConfirmingIndex(null);
                    setEnding(null);
                  }}
                >
                  <Pencil size={14} aria-hidden="true" />
                </button>
                <button type="button" className="profile-icon-button" aria-label={t('ledger.removeItem', { name })} onClick={() => setConfirmingIndex(index)}>
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            )}
            {ending?.index === index && (
              <div className="income-row__ending" role="group" aria-label={t('income.endLabel', { label: stream.label })}>
                <div className="form-group">
                  <label className="form-label" htmlFor={`${id}-last-day`}>
                    {t('income.lastDayPaid')}
                  </label>
                  <input
                    id={`${id}-last-day`}
                    type="date"
                    className="form-input"
                    value={ending.lastDay}
                    min={stream.startDate}
                    onChange={(event) => setEnding({ ...ending, lastDay: clampDateYear(event.target.value), error: null })}
                  />
                </div>
                <SegmentedChoice
                  name={`${id}-end-reason`}
                  legend={t('income.whatHappened')}
                  options={endReasonOptions(t)}
                  value={ending.reason === '' ? null : ending.reason}
                  onChange={(reason) => setEnding({ ...ending, reason })}
                />
                {ending.error && (
                  <p className="form-error-text" role="alert">
                    {ending.error}
                  </p>
                )}
                <div className="cost-editor__actions">
                  <button type="button" className="btn-primary-apply" disabled={incomeBusy} aria-busy={incomeBusy} onClick={confirmEnding}>
                    {t('income.endJob')}
                  </button>
                  <button type="button" className="btn-secondary-cancel" onClick={() => setEnding(null)}>
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </li>
    );
  };

  const group = (title: string, rows: IncomeRow[], isEnded = false) =>
    rows.length > 0 && (
      <div className="income-group">
        {populatedGroups > 1 && <h5 className="income-group__title">{title}</h5>}
        <ul className="cost-list" aria-label={title}>
          {rows.map((row) => renderRow(row, isEnded))}
        </ul>
      </div>
    );

  return (
    <section aria-labelledby={`${id}-income`}>
      <div className="phase-details__heading-row">
        <h4 className="phase-details__heading" id={`${id}-income`}>
          {t('income.heading')}
        </h4>
        {editing === null && (
          <button type="button" className="profile-text-button" onClick={() => setEditing({ mode: 'add' })}>
            <Plus size={14} aria-hidden="true" /> {t('income.addJob')}
          </button>
        )}
      </div>

      {gaps.map((gap) => (
        <p key={gap.from} className="income-gap" data-gap={gap.from}>
          {gap.to === null ? t('income.gapSince', { date: formatCalendarDate(gap.from) }) : t('income.gapBetween', { from: formatCalendarDate(gap.from), to: formatCalendarDate(gap.to) })}
        </p>
      ))}

      {group(t('income.group.paying'), groups.paying)}
      {group(t('income.group.ended'), groups.ended, true)}
      {group(t('income.group.oneTime'), groups.oneTime)}

      {editing?.mode === 'add' && <IncomeStreamEditor phase={phase} onSubmit={submit} onCancel={() => setEditing(null)} />}

      {removeError && (
        <p className="form-error-text" role="alert">
          {removeError}
        </p>
      )}
    </section>
  );
}
