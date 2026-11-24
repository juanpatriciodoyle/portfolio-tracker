/** What the sign-in code can ask of the human check, whatever vendor draws it. */
export interface HumanCheckHandle {
  /** Runs the check, showing a challenge only if the vendor wants one. Resolves with the answer to send; rejects if it was not completed. */
  execute(): Promise<string>;
  /** Forgets the answer: it works once, so this follows every attempt. */
  reset(): void;
}

/** The person closed the challenge, or it could not be completed. Nothing was sent to the server. */
export class HumanCheckIncompleteError extends Error {
  constructor() {
    super('The human check was not completed');
    this.name = 'HumanCheckIncompleteError';
  }
}
