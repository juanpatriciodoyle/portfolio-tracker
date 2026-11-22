/** An answer older than this is not worth showing, even for the moment it takes to ask again. */
export const PORTFOLIO_CACHE_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * The last answer for each signed-in person, kept in memory only (a refresh starts clean, and nothing financial is
 * written to storage). People are told apart by their session, so one never sees another's figures. The clock is passed in.
 */
export function createPortfolioCache<Answer>() {
  const answers = new Map<string, { answer: Answer; at: number }>();

  return {
    read(person: string | null, now: number): Answer | null {
      if (!person) return null;
      const stored = answers.get(person);
      if (!stored) return null;
      if (now - stored.at >= PORTFOLIO_CACHE_MAX_AGE_MS) {
        answers.delete(person);
        return null;
      }
      return stored.answer;
    },
    write(person: string | null, answer: Answer, now: number): void {
      if (person) answers.set(person, { answer, at: now });
    },
    clear(): void {
      answers.clear();
    },
  };
}
