import { jobsToCarry, type IncomeStreamDto, type LivingPhaseDto } from '../../contracts';

/** A job of the previous home that could carry on in the new one. */
export interface CarryCandidate {
  /** Stable while the form is open, so a tick or an amount can be kept against it. */
  key: string;
  stream: IncomeStreamDto;
  /** False when the new home is paid in another currency: the amount must be typed again, never converted silently. */
  sameCurrency: boolean;
}

/** What the person chose: the jobs they unticked and the amounts they re-typed. Everything starts ticked. */
export interface CarryChoice {
  unticked: string[];
  amounts: Record<string, string>;
}

export const NO_CARRY_CHOICE: CarryChoice = { unticked: [], amounts: {} };

const keyOf = (stream: IncomeStreamDto) => `${stream.label}|${stream.startDate}`;

/** The home lived in just before the new one: the latest to start before it. Nothing carries into the very first home. */
function previousHome(phases: readonly LivingPhaseDto[], newStart: string): LivingPhaseDto | null {
  return [...phases].filter((phase) => phase.startDate < newStart).sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;
}

export function carryCandidates(phases: readonly LivingPhaseDto[], newStart: string, newCurrency: string): CarryCandidate[] {
  if (newStart === '') return [];
  const previous = previousHome(phases, newStart);
  if (previous === null) return [];
  return jobsToCarry(previous.incomeStreams, newStart).map((stream) => ({ key: keyOf(stream), stream, sameCurrency: previous.currency === newCurrency }));
}

export type CarriedJobs = { ok: true; streams: IncomeStreamDto[] } | { ok: false; message: string };

/**
 * The jobs to start the new home with. Income is counted inside the days of a home, so each copy starts on the first day
 * of the new one (the days before belong to the previous home, which keeps its own job untouched). A job in another
 * currency needs its amount typed again.
 */
export function carriedStreams(
  candidates: readonly CarryCandidate[],
  choice: CarryChoice,
  newStart: string,
  parseAmount: (text: string) => number | null
): CarriedJobs {
  const streams: IncomeStreamDto[] = [];
  for (const { key, stream, sameCurrency } of candidates) {
    if (choice.unticked.includes(key)) continue;
    const amountMinor = sameCurrency ? stream.amountMinor : parseAmount(choice.amounts[key] ?? '');
    if (amountMinor === null) return { ok: false, message: `Enter what ${stream.label} pays each month here, or untick it.` };
    // A job that ends before the new home starts cannot be carried, and the filter above leaves none; a kept end date stays.
    const { endReason: _reason, ...rest } = stream;
    streams.push({ ...rest, amountMinor, startDate: newStart });
  }
  return { ok: true, streams };
}
