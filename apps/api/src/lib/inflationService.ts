import {
  defaultAnnualInflationPercent,
  holdingPeriodInflationPercent,
  type InflationRateProvider,
} from '../domain/inflation';
import { syncCountryInflationHistory, worldBankInflationRates } from '../infrastructure/worldBankInflationRates';

export { syncCountryInflationHistory };

/**
 * Imperative shell around the pure domain maths: reads the clock (default end date) and the
 * rate provider, then delegates the calculation to holdingPeriodInflationPercent.
 */
export async function calculateHoldingPeriodInflation(
  country: string,
  startDate: Date,
  endDate: Date = new Date(),
  rates: InflationRateProvider = worldBankInflationRates
): Promise<number> {
  return holdingPeriodInflationPercent({
    annualRates: await rates.getAnnualRates(country),
    fallbackAnnualRate: defaultAnnualInflationPercent(country),
    start: startDate,
    end: endDate,
  });
}
