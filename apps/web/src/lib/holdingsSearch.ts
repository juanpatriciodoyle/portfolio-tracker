export interface SearchableHolding {
  symbol: string;
  name: string;
  sector: string;
}

const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** One box, no modes: every word typed must appear in the ticker, the name or the sector. */
export function matchesHoldingsQuery(holding: SearchableHolding, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalize(`${holding.symbol} ${holding.name} ${holding.sector}`);
  return words.every((word) => haystack.includes(word));
}
