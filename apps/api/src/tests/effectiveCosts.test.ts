import { FIXED_COST_CATEGORIES, type FixedCostCategory } from '../contracts';
import { effectiveMonthlyCosts as effectiveMonthlyCostsAt, type BilledCost, type DeclaredCost } from '../domain/effectiveCosts';

const AS_OF = '2026-10-15';
/** These cases are about amounts, not end dates: any day will do. */
const effectiveMonthlyCosts = (input: Omit<Parameters<typeof effectiveMonthlyCostsAt>[0], 'asOf'>) => effectiveMonthlyCostsAt({ ...input, asOf: AS_OF });
import { monthlyBurnByCategory, monthlyFixedCostBurn } from '../domain/fixedCosts';

const declared = (category: FixedCostCategory, amountMinor: number, cadence: DeclaredCost['cadence'] = 'MONTHLY', label: string | null = null): DeclaredCost => ({
  category,
  amountMinor,
  cadence,
  label,
});

const bill = (
  category: FixedCostCategory,
  amountMinor: number,
  periodStart: string,
  periodEnd: string,
  cadence: BilledCost['cadence'] = 'MONTHLY',
  vendor = 'Vendor'
): BilledCost => ({ category, amountMinor, periodStart, periodEnd, cadence, vendor });

const monthly = (result: ReturnType<typeof effectiveMonthlyCosts>) =>
  Object.fromEntries(FIXED_COST_CATEGORIES.map((category) => [category, result.byCategory[category].monthlyMinor])) as Record<FixedCostCategory, number>;

describe('effectiveMonthlyCosts without bills', () => {
  it.each([
    ['nothing', []],
    ['one monthly rent', [declared('RENT', 90000)]],
    ['mixed cadences', [declared('RENT', 90000), declared('WATER', 9650, 'BIMONTHLY'), declared('TAXES', 31000, 'ANNUAL'), declared('GAS', 10000, 'QUARTERLY')]],
    ['rounding that needs the largest remainder', [declared('GAS', 1, 'BIMONTHLY'), declared('WATER', 1, 'BIMONTHLY'), declared('INTERNET', 1, 'BIMONTHLY')]],
    ['a tie broken by category order', [declared('ELECTRICITY', 5, 'BIMONTHLY'), declared('INTERNET', 5, 'BIMONTHLY')]],
  ])('is exactly the declared burn for %s', (_name, costs) => {
    const result = effectiveMonthlyCosts({ declared: costs, bills: [] });
    expect(result.monthlyFixedCostsMinor).toBe(monthlyFixedCostBurn(costs));
    expect(monthly(result)).toEqual(monthlyBurnByCategory(costs));
  });

  it('marks a category with a declared cost as declared and an empty one as having no basis', () => {
    const result = effectiveMonthlyCosts({ declared: [declared('RENT', 90000)], bills: [] });
    expect(result.byCategory.RENT).toEqual({ monthlyMinor: 90000, basis: 'DECLARED', billCount: 0 });
    expect(result.byCategory.GAS).toEqual({ monthlyMinor: 0, basis: null, billCount: 0 });
  });
});

describe('variable utilities', () => {
  it('replace the declared rate with the average of the bills, weighted by the months each covers', () => {
    const result = effectiveMonthlyCosts({
      declared: [declared('ELECTRICITY', 8000)],
      bills: [bill('ELECTRICITY', 10000, '2026-07-15', '2026-09-14', 'BIMONTHLY'), bill('ELECTRICITY', 6000, '2026-09-15', '2026-10-14')],
    });
    expect(result.byCategory.ELECTRICITY).toEqual({ monthlyMinor: 5333, basis: 'BILLS', billCount: 2 });
  });

  it('keeps the declared rate until the first bill arrives, then moves with every new bill', () => {
    const first = bill('GAS', 4000, '2026-01-01', '2026-01-31');
    const second = bill('GAS', 6000, '2026-02-01', '2026-02-28');
    expect(effectiveMonthlyCosts({ declared: [declared('GAS', 3000)], bills: [] }).byCategory.GAS.monthlyMinor).toBe(3000);
    expect(effectiveMonthlyCosts({ declared: [declared('GAS', 3000)], bills: [first] }).byCategory.GAS.monthlyMinor).toBe(4000);
    expect(effectiveMonthlyCosts({ declared: [declared('GAS', 3000)], bills: [first, second] }).byCategory.GAS.monthlyMinor).toBe(5000);
  });

  it('covers water and heating / cooling the same way', () => {
    const result = effectiveMonthlyCosts({
      declared: [],
      bills: [bill('WATER', 9000, '2026-01-01', '2026-02-28', 'BIMONTHLY'), bill('HEATING_COOLING', 12000, '2026-01-01', '2026-01-31'), bill('HEATING_COOLING', 8000, '2026-02-01', '2026-02-28')],
    });
    expect(result.byCategory.WATER.monthlyMinor).toBe(4500);
    expect(result.byCategory.HEATING_COOLING).toEqual({ monthlyMinor: 10000, basis: 'BILLS', billCount: 2 });
  });

  it('averages every bill of the phase, whatever the sender and the order they were logged in', () => {
    const bills = [bill('ELECTRICITY', 3000, '2026-01-01', '2026-01-31', 'MONTHLY', 'Iberdrola'), bill('ELECTRICITY', 5000, '2026-02-01', '2026-02-28', 'MONTHLY', 'Endesa')];
    expect(effectiveMonthlyCosts({ declared: [], bills }).byCategory.ELECTRICITY.monthlyMinor).toBe(4000);
    expect(effectiveMonthlyCosts({ declared: [], bills: [...bills].reverse() }).byCategory.ELECTRICITY.monthlyMinor).toBe(4000);
  });

  it('spreads a one-off charge over the months its days cover, at least one', () => {
    const result = effectiveMonthlyCosts({ declared: [], bills: [bill('GAS', 6000, '2026-01-01', '2026-02-28', 'ONE_OFF'), bill('WATER', 2500, '2026-03-10', '2026-03-10', 'ONE_OFF')] });
    expect(result.byCategory.GAS.monthlyMinor).toBe(3000);
    expect(result.byCategory.WATER.monthlyMinor).toBe(2500);
  });
});

describe('taxes', () => {
  it('average across the entries of the household as one year each', () => {
    const result = effectiveMonthlyCosts({
      declared: [declared('TAXES', 99999, 'ANNUAL')],
      bills: [bill('TAXES', 30000, '2025-01-01', '2025-12-31', 'ANNUAL'), bill('TAXES', 36000, '2026-01-01', '2026-12-31', 'ANNUAL')],
    });
    expect(result.byCategory.TAXES).toEqual({ monthlyMinor: 2750, basis: 'BILLS', billCount: 2 });
  });

  it('count a one-off tax as a year of tax, however short the period it names', () => {
    const result = effectiveMonthlyCosts({ declared: [], bills: [bill('TAXES', 36000, '2026-04-15', '2026-04-15', 'ONE_OFF')] });
    expect(result.byCategory.TAXES.monthlyMinor).toBe(3000);
  });
});

describe('fixed baseline items', () => {
  const internet = (amountMinor: number, month: string) => bill('INTERNET', amountMinor, `2026-${month}-01`, `2026-${month}-28`, 'MONTHLY', 'Digi');

  it('use the declared rate until a bill arrives', () => {
    expect(effectiveMonthlyCosts({ declared: [declared('INTERNET', 3000)], bills: [] }).byCategory.INTERNET.monthlyMinor).toBe(3000);
  });

  it('move to a new plan price gradually, through the average of the latest three months of bills', () => {
    const declaredPlan = [declared('INTERNET', 3000)];
    const old = [internet(3000, '01'), internet(3000, '02'), internet(3000, '03')];
    expect(effectiveMonthlyCosts({ declared: declaredPlan, bills: old }).byCategory.INTERNET.monthlyMinor).toBe(3000);
    expect(effectiveMonthlyCosts({ declared: declaredPlan, bills: [...old, internet(5000, '04')] }).byCategory.INTERNET.monthlyMinor).toBe(3667);
    expect(effectiveMonthlyCosts({ declared: declaredPlan, bills: [...old, internet(5000, '04'), internet(5000, '05')] }).byCategory.INTERNET.monthlyMinor).toBe(4333);
    expect(effectiveMonthlyCosts({ declared: declaredPlan, bills: [...old, internet(5000, '04'), internet(5000, '05'), internet(5000, '06')] }).byCategory.INTERNET.monthlyMinor).toBe(5000);
  });

  it('averages a rent bill at a new price with the previous ones of the same phase', () => {
    const result = effectiveMonthlyCosts({
      declared: [declared('RENT', 90000)],
      bills: [bill('RENT', 90000, '2026-01-01', '2026-01-31'), bill('RENT', 90000, '2026-02-01', '2026-02-28'), bill('RENT', 100000, '2026-03-01', '2026-03-31')],
    });
    expect(result.byCategory.RENT).toEqual({ monthlyMinor: 93333, basis: 'BILLS', billCount: 3 });
  });

  it('are not changed by the order the bills were logged in', () => {
    const bills = [internet(3000, '01'), internet(3000, '02'), internet(3000, '03'), internet(5000, '04')];
    expect(effectiveMonthlyCosts({ declared: [], bills: [...bills].reverse() }).byCategory.INTERNET.monthlyMinor).toBe(3667);
  });

  it('weigh a bill by the months it covers', () => {
    const result = effectiveMonthlyCosts({ declared: [], bills: [bill('RENT', 270000, '2026-01-01', '2026-03-31', 'QUARTERLY', 'Landlord')] });
    expect(result.byCategory.RENT.monthlyMinor).toBe(90000);
  });

  it('let bills replace every declared rent, internet and phone line', () => {
    const result = effectiveMonthlyCosts({
      declared: [declared('RENT', 90000), declared('PHONE', 1000, 'MONTHLY', 'Mine'), declared('PHONE', 1500, 'MONTHLY', 'Partner')],
      bills: [bill('RENT', 95000, '2026-01-01', '2026-01-31'), bill('PHONE', 1200, '2026-01-01', '2026-01-31', 'MONTHLY', 'Vodafone')],
    });
    expect(result.byCategory.RENT.monthlyMinor).toBe(95000);
    expect(result.byCategory.PHONE.monthlyMinor).toBe(1200);
  });

  it('keep a declared subscription that no bill is for, and replace the one a bill matches', () => {
    const result = effectiveMonthlyCosts({
      declared: [declared('SUBSCRIPTIONS', 1500, 'MONTHLY', 'Netflix'), declared('SUBSCRIPTIONS', 1000, 'MONTHLY', 'Spotify Duo')],
      bills: [bill('SUBSCRIPTIONS', 1700, '2026-01-01', '2026-01-31', 'MONTHLY', 'NETFLIX')],
    });
    expect(result.byCategory.SUBSCRIPTIONS).toEqual({ monthlyMinor: 2700, basis: 'MIXED', billCount: 1 });
  });

  it('average each sender on its own, so two subscriptions never blend into one', () => {
    const result = effectiveMonthlyCosts({
      declared: [],
      bills: [
        bill('SUBSCRIPTIONS', 1700, '2026-01-01', '2026-01-31', 'MONTHLY', 'Netflix'),
        bill('SUBSCRIPTIONS', 1700, '2026-02-01', '2026-02-28', 'MONTHLY', 'Netflix'),
        bill('SUBSCRIPTIONS', 12000, '2026-01-01', '2026-12-31', 'ANNUAL', 'Dropbox'),
      ],
    });
    expect(result.byCategory.SUBSCRIPTIONS.monthlyMinor).toBe(2700);
  });
});

describe('the whole', () => {
  it('always adds up: the categories sum to the monthly total', () => {
    const result = effectiveMonthlyCosts({
      declared: [declared('RENT', 90001), declared('INTERNET', 1, 'BIMONTHLY'), declared('OTHER', 7, 'QUARTERLY')],
      bills: [bill('GAS', 1001, '2026-01-01', '2026-02-28', 'BIMONTHLY'), bill('WATER', 2003, '2026-01-01', '2026-03-31', 'QUARTERLY'), bill('ELECTRICITY', 5, '2026-01-01', '2026-01-31')],
    });
    const sum = FIXED_COST_CATEGORIES.reduce((total, category) => total + result.byCategory[category].monthlyMinor, 0);
    expect(sum).toBe(result.monthlyFixedCostsMinor);
  });

  it('counts a zero bill as a bill: the month is covered and cost nothing', () => {
    const result = effectiveMonthlyCosts({ declared: [declared('GAS', 3000)], bills: [bill('GAS', 0, '2026-01-01', '2026-01-31')] });
    expect(result.byCategory.GAS).toEqual({ monthlyMinor: 0, basis: 'BILLS', billCount: 1 });
  });
});
