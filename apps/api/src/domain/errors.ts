/** Business-rule failures. Each carries a stable `code` so outer layers can map it without string matching. */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidLivingPhaseError extends DomainError {
  readonly code = 'INVALID_LIVING_PHASE';
}

export class InvalidProfileError extends DomainError {
  readonly code = 'INVALID_PROFILE';
}

/** The dates of a living phase overlap other phases of the same person. */
export class PhaseOverlapError extends DomainError {
  readonly code = 'PHASE_OVERLAP';

  constructor(readonly conflictingPhaseIds: readonly string[]) {
    super('Living phases cannot overlap');
  }
}

export class MissingFxRateError extends DomainError {
  readonly code = 'MISSING_FX_RATE';

  constructor(readonly currency: string) {
    super(`No exchange rate available for ${currency}`);
  }
}

export class InvalidFxRateError extends DomainError {
  readonly code = 'INVALID_FX_RATE';

  constructor(readonly currency: string) {
    super(`The exchange rate for ${currency} must be a positive, finite number`);
  }
}
