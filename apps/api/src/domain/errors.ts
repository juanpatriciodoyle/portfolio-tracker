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

export class InvalidBillingRecordError extends DomainError {
  readonly code = 'INVALID_BILLING_RECORD';
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

/** The same bill (phase, category, period, amount and sender) is already recorded. */
export class DuplicateBillingRecordError extends DomainError {
  readonly code = 'DUPLICATE_BILLING_RECORD';

  constructor(readonly existingRecordId: string) {
    super('This bill is already recorded');
  }
}

/** A sale asks for more units than the person held on that date (or for an instrument never held). */
export class InsufficientHoldingsError extends DomainError {
  readonly code = 'INSUFFICIENT_HOLDINGS';

  constructor(
    readonly symbol: string,
    readonly requestedUnits: number,
    readonly availableUnits: number
  ) {
    super(
      availableUnits > 0
        ? `You can sell at most ${availableUnits} units of ${symbol}; you asked for ${requestedUnits}.`
        : `You do not hold ${symbol} on that date, so it cannot be sold.`
    );
  }
}
