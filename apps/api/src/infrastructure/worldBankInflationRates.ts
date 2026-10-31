import { db } from '../lib/db';
import { defaultAnnualInflationPercent, type InflationRateProvider } from '../domain/inflation';

const COUNTRY_ISO3: Record<string, string> = {
  Spain: 'ESP',
  Germany: 'DEU',
  'United Kingdom': 'GBR',
  'United States': 'USA',
  Argentina: 'ARG',
  Brazil: 'BRA',
  Japan: 'JPN',
  France: 'FRA',
  Italy: 'ITA',
};

/**
 * Fetches and caches historical year-by-year inflation rates for a country from World Bank API
 */
export async function syncCountryInflationHistory(country: string): Promise<Record<number, number>> {
  const code = COUNTRY_ISO3[country] || 'ESP';
  const rateMap: Record<number, number> = {};

  try {
    const cachedRates = await db.inflationRate.findMany({
      where: { country },
    });

    for (const item of cachedRates) {
      rateMap[item.year] = item.rate;
    }

    // If we already have recent data, return cached map
    const currentYear = new Date().getFullYear();
    if (Object.keys(rateMap).length > 5 && rateMap[currentYear - 1] !== undefined) {
      return rateMap;
    }
  } catch (err) {
    // Database might not be initialized or accessible yet in test environment
  }

  try {
    const url = `https://api.worldbank.org/v2/country/${code}/indicator/FP.CPI.TOTL.ZG?format=json&per_page=30`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 1 && Array.isArray(data[1])) {
        for (const item of data[1]) {
          const yr = parseInt(item.date, 10);
          if (!isNaN(yr) && item.value !== null && typeof item.value === 'number') {
            const val = Math.round(item.value * 10) / 10;
            rateMap[yr] = val;

            try {
              await db.inflationRate.upsert({
                where: { country_year: { country, year: yr } },
                update: { rate: val },
                create: { country, year: yr, rate: val },
              });
            } catch {
              // Ignore DB write errors if unmigrated
            }
          }
        }
        console.log(`🌐 Synced historical annual inflation rates for ${country} (${Object.keys(rateMap).length} years)`);
        return rateMap;
      }
    }
  } catch (err) {
    console.warn(`Could not fetch live inflation history for ${country}, using defaults.`);
  }

  // Fallback defaults for last 10 years if offline
  const currentYear = new Date().getFullYear();
  const defaultRate = defaultAnnualInflationPercent(country);
  for (let y = currentYear - 10; y <= currentYear; y++) {
    if (!rateMap[y]) rateMap[y] = defaultRate;
  }

  return rateMap;
}

export const worldBankInflationRates: InflationRateProvider = {
  getAnnualRates: syncCountryInflationHistory,
};
