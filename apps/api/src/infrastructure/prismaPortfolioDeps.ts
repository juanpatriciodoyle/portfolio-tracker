import type { PrismaClient } from '@prisma/client';
import { syncCountryInflationHistory } from '../lib/inflationService';
import { getPortfolioHistory, getPortfolioOverview, getPortfolioPerformancePeriods, processTransaction } from '../lib/pnlEngine';
import type { PortfolioRouterDeps } from '../routes/portfolio';

/** Connects the portfolio routes to the engine and the database. */
export function createPrismaPortfolioDeps(prisma: PrismaClient): PortfolioRouterDeps {
  return {
    overview: getPortfolioOverview,
    history: getPortfolioHistory,
    performancePeriods: getPortfolioPerformancePeriods,
    listTransactions: (userId) => prisma.transaction.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
    recordTransaction: processTransaction,
    getSettings: async (userId) => {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      return user && { country: user.country, baseCurrency: user.baseCurrency, annualInflationRate: user.annualInflationRate, cashBalance: user.cashBalance };
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
