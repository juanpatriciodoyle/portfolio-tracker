import { calculateHoldingPeriodInflation } from '../lib/inflationService';

describe('Multi-Tranche Holding Period Inflation & Multi-Year PnL Accounting Engine', () => {
  it('should calculate pro-rated inflation for a same-year holding period (e.g. 6 months)', async () => {
    const buyDate = new Date('2024-01-01');
    const sellDate = new Date('2024-07-01');

    const inflation = await calculateHoldingPeriodInflation('Spain', buyDate, sellDate);

    expect(inflation).toBeGreaterThan(0);
    expect(inflation).toBeLessThan(10); // Normal annual CPI bounds
  });

  it('should compound multi-year holding inflation across multiple years (e.g. 2021 to 2024)', async () => {
    const buyDate2021 = new Date('2021-01-01');
    const sellDate2024 = new Date('2024-01-01');

    const inflation3Yr = await calculateHoldingPeriodInflation('Spain', buyDate2021, sellDate2024);
    const inflation1Yr = await calculateHoldingPeriodInflation('Spain', new Date('2023-01-01'), sellDate2024);

    // 3-year holding inflation must be compoundingly larger than 1-year holding inflation
    expect(inflation3Yr).toBeGreaterThan(inflation1Yr);
  });

  it('should calculate distinct holding inflation rates for multi-tranche purchases on different dates', async () => {
    // Tranche 1: Bought 3 years ago (2021)
    const tranche1Buy = new Date('2021-03-15');
    // Tranche 2: Bought 1 year ago (2023)
    const tranche2Buy = new Date('2023-03-15');

    const exitDate = new Date('2024-03-15');

    const tranche1Inflation = await calculateHoldingPeriodInflation('Spain', tranche1Buy, exitDate);
    const tranche2Inflation = await calculateHoldingPeriodInflation('Spain', tranche2Buy, exitDate);

    expect(tranche1Inflation).toBeGreaterThan(tranche2Inflation);

    // Calculate loss due to inflation on 10,000 EUR invested per tranche
    const investedAmount = 10000;
    const tranche1Loss = investedAmount * (tranche1Inflation / 100);
    const tranche2Loss = investedAmount * (tranche2Inflation / 100);

    expect(tranche1Loss).toBeGreaterThan(tranche2Loss);
  });

  it('should support mixed asset class portfolios with varying holding periods', async () => {
    const stockBuy = new Date('2020-01-01'); // 4-year holding (e.g., AAPL)
    const etfBuy = new Date('2023-01-01');   // 1-year holding (e.g., VUAA.DE)
    const cryptoBuy = new Date('2024-01-01'); // 6-month holding (e.g., BTC-USD)

    const now = new Date('2024-07-01');

    const stockInflation = await calculateHoldingPeriodInflation('Germany', stockBuy, now);
    const etfInflation = await calculateHoldingPeriodInflation('Germany', etfBuy, now);
    const cryptoInflation = await calculateHoldingPeriodInflation('Germany', cryptoBuy, now);

    expect(stockInflation).toBeGreaterThan(etfInflation);
    expect(etfInflation).toBeGreaterThan(cryptoInflation);
  });
});
