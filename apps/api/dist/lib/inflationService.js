"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncCountryInflationHistory = syncCountryInflationHistory;
exports.calculateHoldingPeriodInflation = calculateHoldingPeriodInflation;
const db_1 = require("./db");
const COUNTRY_ISO3 = {
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
// Default fallback annual inflation rates if API is unreachable
const DEFAULT_ANNUAL_RATES = {
    Spain: 2.8,
    Germany: 2.6,
    'United Kingdom': 2.3,
    'United States': 3.1,
    Argentina: 210.0,
    Brazil: 4.2,
    Japan: 2.8,
    France: 2.5,
    Italy: 2.7,
};
/**
 * Fetches and caches historical year-by-year inflation rates for a country from World Bank API
 */
async function syncCountryInflationHistory(country) {
    const code = COUNTRY_ISO3[country] || 'ESP';
    const cachedRates = await db_1.db.inflationRate.findMany({
        where: { country },
    });
    const rateMap = {};
    for (const item of cachedRates) {
        rateMap[item.year] = item.rate;
    }
    // If we already have recent data, return cached map
    const currentYear = new Date().getFullYear();
    if (Object.keys(rateMap).length > 5 && rateMap[currentYear - 1] !== undefined) {
        return rateMap;
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
                        await db_1.db.inflationRate.upsert({
                            where: { country_year: { country, year: yr } },
                            update: { rate: val },
                            create: { country, year: yr, rate: val },
                        });
                    }
                }
                console.log(`🌐 Synced historical annual inflation rates for ${country} (${Object.keys(rateMap).length} years)`);
                return rateMap;
            }
        }
    }
    catch (err) {
        console.warn(`Could not fetch live inflation history for ${country}, using defaults.`);
    }
    // Fallback defaults for last 10 years if offline
    const defaultRate = DEFAULT_ANNUAL_RATES[country] || 2.8;
    for (let y = currentYear - 10; y <= currentYear; y++) {
        if (!rateMap[y])
            rateMap[y] = defaultRate;
    }
    return rateMap;
}
/**
 * Calculates compound time-weighted inflation for a specific transaction holding period.
 * startDate: Date asset was bought
 * endDate: Date asset was sold or today
 */
async function calculateHoldingPeriodInflation(country, startDate, endDate = new Date()) {
    const rateMap = await syncCountryInflationHistory(country);
    const startYr = startDate.getFullYear();
    const endYr = endDate.getFullYear();
    let compoundFactor = 1.0;
    if (startYr === endYr) {
        // Pro-rate within the same year by months
        const months = Math.max(1, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
        const annualRate = (rateMap[startYr] || DEFAULT_ANNUAL_RATES[country] || 2.8) / 100;
        const periodRate = annualRate * (months / 12);
        compoundFactor *= 1 + periodRate;
    }
    else {
        for (let yr = startYr; yr <= endYr; yr++) {
            const annualRate = (rateMap[yr] || DEFAULT_ANNUAL_RATES[country] || 2.8) / 100;
            if (yr === startYr) {
                const monthsLeftInYear = 12 - startDate.getMonth();
                compoundFactor *= 1 + annualRate * (monthsLeftInYear / 12);
            }
            else if (yr === endYr) {
                const monthsPassedInYear = endDate.getMonth() + 1;
                compoundFactor *= 1 + annualRate * (monthsPassedInYear / 12);
            }
            else {
                compoundFactor *= 1 + annualRate;
            }
        }
    }
    const cumulativeInflationPercent = (compoundFactor - 1) * 100;
    return Math.round(cumulativeInflationPercent * 10) / 10;
}
