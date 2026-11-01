import { flagEmoji } from './countries';

/** The longest name the API accepts for a living phase. */
export const PHASE_NAME_MAX_LENGTH = 80;

interface PhasePlace {
  countryCode: string;
  city: string;
  address?: string | null;
}

const tidy = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

/** Cuts text to at most `budget` UTF-16 units without splitting a character, ending with an ellipsis. */
function clamp(text: string, budget: number): string {
  if (text.length <= budget) return text;
  let kept = '';
  for (const character of text) {
    if (kept.length + character.length > budget - 1) break;
    kept += character;
  }
  return `${kept.trimEnd()}…`;
}

/** A home's header, always built from where it is: "🇪🇸 Madrid Calle Mayor 1". People never type a name. */
export function phaseDisplayName({ countryCode, city, address }: PhasePlace): string {
  const flag = flagEmoji(countryCode);
  const prefix = flag === '' ? '' : `${flag} `;
  const place = [tidy(city), tidy(address)].filter((part) => part !== '').join(' ');
  return `${prefix}${clamp(place, PHASE_NAME_MAX_LENGTH - prefix.length)}`;
}

/**
 * Phases saved before names were generated carry whatever their owner typed. Showing every phase,
 * and the timeline entries that mention it, under its generated name keeps one header everywhere.
 */
export function withDisplayNames<P extends PhasePlace & { id: string; name: string }, E extends { phaseId: string; name: string }>(
  phases: readonly P[],
  entries: readonly E[]
): { phases: P[]; entries: E[] } {
  const names = new Map(phases.map((phase) => [phase.id, phaseDisplayName(phase)]));
  return {
    phases: phases.map((phase) => ({ ...phase, name: names.get(phase.id) ?? phase.name })),
    entries: entries.map((entry) => ({ ...entry, name: names.get(entry.phaseId) ?? entry.name })),
  };
}
