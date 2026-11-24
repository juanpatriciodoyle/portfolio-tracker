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

/** A purchase paid with cash asks for more cash than the person holds in that currency. */
export class InsufficientCashError extends DomainError {
  readonly code = 'INSUFFICIENT_CASH';
  /** What the person holds in `currency`, in minor units (cents), so the screen can say it without rounding. */
  readonly availableMinor: number;

  constructor(
    readonly currency: string,
    readonly requested: number,
    available: number
  ) {
    super(
      available > 0
        ? `You hold ${available.toFixed(2)} ${currency} in cash and this purchase needs ${requested.toFixed(2)} ${currency}.`
        : `You hold no ${currency} in cash, so this purchase cannot be paid with cash.`
    );
    this.availableMinor = Math.round(Math.max(0, available) * 100);
  }
}

/** Changing or removing a transaction would leave a later one without what it needs: the units it sells, or the cash it pays with. */
export class TransactionRequiredByLaterError extends DomainError {
  readonly code = 'TRANSACTION_REQUIRED_BY_LATER';

  constructor(
    readonly dependent: { readonly id: string; readonly type: 'BOUGHT' | 'SOLD' | 'DEPOSIT' | 'WITHDRAWAL'; readonly symbol: string; readonly date: string }
  ) {
    super(`Another transaction depends on this one (${dependent.type} ${dependent.symbol}, ${dependent.date}), so it cannot be changed this way.`);
  }
}
