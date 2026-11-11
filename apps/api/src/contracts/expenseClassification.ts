import { VARIABLE_COST_CATEGORIES, type BillingCadence, type CostCadence, type FixedCostCategory } from './vocabulary';

/**
 * What a person answered while adding an expense. The person never picks how it is stored: this is the one
 * place that decides it, for the API and for the form alike (pure, so both can run the same rule).
 */
export interface ExpenseAnswers {
  readonly category: FixedCostCategory;
  /** How often it comes; `ONE_OFF` is "one time only". */
  readonly cadence: BillingCadence;
  /** The days it covers (or the day it was paid) were given. */
  readonly hasDates: boolean;
  /** It was read from a PDF: a document is always a bill that arrived. */
  readonly fromDocument: boolean;
  /** The answer to "Will this come again?"; null while it has not been asked. */
  readonly repeats: boolean | null;
}

/**
 * RECEIPT: a bill that arrived, stored with the days it covers (a `BillingRecord`).
 * RECURRING_RATE: what something costs every so often, with no days (a `FixedCostItem`).
 * ASK_REPEATS: the answers do not settle it; ask "Will this come again?" and classify again.
 */
export type ExpenseClassification =
  | { readonly kind: 'RECEIPT'; readonly cadence: BillingCadence }
  | { readonly kind: 'RECURRING_RATE'; readonly cadence: CostCadence }
  | { readonly kind: 'ASK_REPEATS' };

const VARIABLE: ReadonlySet<FixedCostCategory> = new Set(VARIABLE_COST_CATEGORIES);

/** Whether a category's bill changes every time (electricity, taxes...): those are only ever receipts. */
export const isVariableCategory = (category: FixedCostCategory): boolean => VARIABLE.has(category);

export function classifyExpense({ category, cadence, hasDates, fromDocument, repeats }: ExpenseAnswers): ExpenseClassification {
  if (fromDocument || cadence === 'ONE_OFF' || isVariableCategory(category)) return { kind: 'RECEIPT', cadence };

  // Rent, internet, phone, subscriptions: with no days it is the rate that repeats.
  if (!hasDates) return { kind: 'RECURRING_RATE', cadence };

  // With days it is a bill that arrived, but whether it is one of a series or a single one is the person's to say.
  if (repeats === null) return { kind: 'ASK_REPEATS' };
  return { kind: 'RECEIPT', cadence: repeats ? cadence : 'ONE_OFF' };
}
