import type { PrismaClient } from '@prisma/client';
import { PortfolioService } from '../application/portfolioService';
import type { PriceProvider } from '../application/ports';
import { calculateHoldingPeriodInflation, syncCountryInflationHistory } from '../lib/inflationService';
import type { PortfolioRouterDeps } from '../routes/portfolio';
import { REFERENCE_EUR_RATES } from './fx/referenceFxRates';
import { marketPrices } from './market/marketPrices';
import { PrismaPortfolioRepository } from './prismaPortfolioRepository';
import { PrismaSnapshotRepository } from './prismaSnapshotRepository';

/** The portfolio use cases wired to the database, the market and the inflation history. */
export function createPortfolioService(prisma: PrismaClient, prices: PriceProvider = marketPrices): PortfolioService {
  return new PortfolioService({
    repository: new PrismaPortfolioRepository(prisma),
    snapshots: new PrismaSnapshotRepository(prisma),
    prices,
    inflation: {
      sync: async (country) => void (await syncCountryInflationHistory(country)),
      between: (country, from, to) => calculateHoldingPeriodInflation(country, from, to),
    },
    eurValue: REFERENCE_EUR_RATES,
    now: () => new Date(),
  });
}

/** Connects the portfolio routes to the use cases and the database. */
export function createPrismaPortfolioDeps(prisma: PrismaClient, portfolio: PortfolioService): PortfolioRouterDeps {
  return {
    overview: (userId) => portfolio.overview(userId),
    history: (userId) => portfolio.history(userId),
    listTransactions: (userId) => prisma.transaction.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
    recordTransaction: (command) => portfolio.recordTransaction(command),
    updateTransaction: (command) => portfolio.updateTransaction(command),
    deleteTransaction: (command) => portfolio.deleteTransaction(command),
    getSettings: async (userId) => {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      return user && { country: user.country, baseCurrency: user.baseCurrency, annualInflationRate: user.annualInflationRate, cashBalance: await portfolio.cashBalance(userId) };
    },
    updateSettings: async (userId, change) => {
      const updated = await prisma.user.update({ where: { id: userId }, data: change });
      return { country: updated.country, baseCurrency: updated.baseCurrency, annualInflationRate: updated.annualInflationRate };
    },
    syncInflation: async (country) => {
      const rates = await syncCountryInflationHistory(country);
      return rates[new Date().getFullYear() - 1] || 2.8;
    },
  };
}
