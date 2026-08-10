import { db } from './db';
import { calculateHoldingPeriodInflation, syncCountryInflationHistory } from './inflationService';

export interface ProcessTransactionParams {
  userId?: string;
  type: 'BOUGHT' | 'SOLD' | 'DEPOSIT' | 'WITHDRAWAL';
  symbol: string;
  name?: string;
  assetClass?: string;
  region?: string;
  sector?: string;
  quantity?: number;
  amount: number;
  fee?: number;
  currency?: string;
  notes?: string;
  date?: string;
}

export async function processTransaction(params: ProcessTransactionParams) {
  const {
    userId,
    type,
    symbol,
    name,
    assetClass = 'Stock',
    region = 'Europe',
    sector = 'Technology',
    quantity = 1.0,
    amount,
    fee = 0,
    currency = 'EUR',
    notes,
    date,
  } = params;

  const totalAmount = amount + (type === 'BOUGHT' ? fee : -fee);
  const txDate = date ? new Date(date) : new Date();

  let targetUserId = userId;
  if (!targetUserId) {
    const adminUser = await db.user.findFirst();
    if (adminUser) {
      targetUserId = adminUser.id;
    }
  }

  // 1. Log Transaction
  const transaction = await db.transaction.create({
    data: {
      userId: targetUserId,
      type,
      symbol: symbol.toUpperCase(),
      name: name || symbol.toUpperCase(),
      assetClass,
      region,
      sector,
      quantity,
      amount,
      totalAmount,
      fee,
      currency,
      notes,
      date: txDate,
    },
  });

  if (!targetUserId) return transaction;

  const user = await db.user.findUnique({ where: { id: targetUserId } });
  if (!user) return transaction;

  // 2. Perform Cash Accounting & Open Position Updates
  if (type === 'DEPOSIT') {
    await db.user.update({
      where: { id: targetUserId },
      data: { cashBalance: { increment: amount } },
    });
  } else if (type === 'WITHDRAWAL') {
    await db.user.update({
      where: { id: targetUserId },
      data: { cashBalance: { decrement: amount } },
    });
  } else if (type === 'BOUGHT') {
    const totalOutflow = amount + fee;
    await db.user.update({
      where: { id: targetUserId },
      data: { cashBalance: { decrement: totalOutflow } },
    });

    const existingPosition = await db.position.findFirst({
      where: { userId: targetUserId, symbol: symbol.toUpperCase() },
    });

    if (existingPosition) {
      await db.position.update({
        where: { id: existingPosition.id },
        data: {
          quantity: existingPosition.quantity + quantity,
          investedAmount: existingPosition.investedAmount + amount,
          updatedAt: new Date(),
        },
      });
    } else {
      await db.position.create({
        data: {
          userId: targetUserId,
          symbol: symbol.toUpperCase(),
          name: name || symbol.toUpperCase(),
          assetClass,
          region,
          sector,
          quantity,
          investedAmount: amount,
          createdAt: txDate,
        },
      });
    }
  } else if (type === 'SOLD') {
    const netInflow = amount - fee;

    await db.user.update({
      where: { id: targetUserId },
      data: { cashBalance: { increment: netInflow } },
    });

    const existingPosition = await db.position.findFirst({
      where: { userId: targetUserId, symbol: symbol.toUpperCase() },
    });

    const costBasis = existingPosition ? existingPosition.investedAmount : amount;
    const realizedCostBasis = Math.min(costBasis, amount);
    const realizedPnl = netInflow - realizedCostBasis;
    const realizedPnlPercent = realizedCostBasis > 0 ? (realizedPnl / realizedCostBasis) * 100 : 0;

    await db.realizedGain.create({
      data: {
        userId: targetUserId,
        symbol: symbol.toUpperCase(),
        assetClass,
        region,
        sector,
        investedAmount: realizedCostBasis,
        returnedAmount: amount,
        realizedPnl,
        realizedPnlPercent,
        date: txDate,
      },
    });

    if (existingPosition) {
      const remainingCapital = existingPosition.investedAmount - realizedCostBasis;
      const remainingQuantity = Math.max(0, existingPosition.quantity - quantity);

      if (remainingCapital <= 0.01 || remainingQuantity <= 0.0001) {
        await db.position.delete({ where: { id: existingPosition.id } });
      } else {
        await db.position.update({
          where: { id: existingPosition.id },
          data: {
            quantity: remainingQuantity,
            investedAmount: remainingCapital,
            updatedAt: new Date(),
          },
        });
      }
    }
  }

  return transaction;
}

export async function getPortfolioOverview(userId?: string) {
  let targetUser = null;

  if (userId) {
    targetUser = await db.user.findUnique({ where: { id: userId } });
  } else {
    targetUser = await db.user.findFirst();
  }

  const cashBalance = targetUser ? targetUser.cashBalance : 0;
  const country = targetUser ? targetUser.country : 'Spain';
  const baseCurrency = targetUser ? targetUser.baseCurrency : 'EUR';
  const targetUserId = targetUser ? targetUser.id : undefined;

  // Sync country inflation history for country
  await syncCountryInflationHistory(country);

  const positions = targetUserId
    ? await db.position.findMany({
        where: { userId: targetUserId },
      })
    : [];

  const realizedGains = targetUserId
    ? await db.realizedGain.findMany({
        where: { userId: targetUserId },
        orderBy: { date: 'desc' },
      })
    : [];

  let openInvestedValue = 0;

  const regionTotals: Record<string, number> = {};
  const sectorTotals: Record<string, number> = {};
  const assetClassTotals: Record<string, number> = {};

  if (cashBalance > 0) {
    assetClassTotals['Cash'] = cashBalance;
    regionTotals['Global'] = cashBalance;
    sectorTotals['Financials'] = cashBalance;
  }

  // Calculate per-position holding period inflation
  let positionInflationEurosLoss = 0;
  for (const pos of positions) {
    openInvestedValue += pos.investedAmount;
    regionTotals[pos.region] = (regionTotals[pos.region] || 0) + pos.investedAmount;
    sectorTotals[pos.sector] = (sectorTotals[pos.sector] || 0) + pos.investedAmount;
    assetClassTotals[pos.assetClass] = (assetClassTotals[pos.assetClass] || 0) + pos.investedAmount;

    // Time-weighted inflation from purchase date to today for open holding
    const inflationPercent = await calculateHoldingPeriodInflation(country, pos.createdAt, new Date());
    positionInflationEurosLoss += pos.investedAmount * (inflationPercent / 100);
  }

  // Calculate per-sold-asset holding period inflation
  let soldAssetsInflationEurosLoss = 0;
  const soldAssetsWithInflation = [];
  for (const gain of realizedGains) {
    const inflationPercent = await calculateHoldingPeriodInflation(country, gain.createdAt, gain.date);
    const inflationLoss = gain.investedAmount * (inflationPercent / 100);
    soldAssetsInflationEurosLoss += inflationLoss;
    const realGainEuros = gain.realizedPnl - inflationLoss;

    soldAssetsWithInflation.push({
      id: gain.id,
      symbol: gain.symbol,
      assetClass: gain.assetClass,
      region: gain.region,
      sector: gain.sector,
      investedAmount: gain.investedAmount,
      returnedAmount: gain.returnedAmount,
      soldProfit: gain.realizedPnl,
      soldProfitPercent: gain.realizedPnlPercent,
      holdingInflationPercent: inflationPercent,
      realProfitEuros: realGainEuros,
      date: gain.date,
    });
  }

  const netWorth = cashBalance + openInvestedValue;
  const soldProfit = realizedGains.reduce((sum, g) => sum + g.realizedPnl, 0);
  const totalProfit = soldProfit;

  const deposits = targetUserId
    ? await db.transaction.aggregate({
        where: { userId: targetUserId, type: 'DEPOSIT' },
        _sum: { amount: true },
      })
    : { _sum: { amount: 0 } };

  const withdrawals = targetUserId
    ? await db.transaction.aggregate({
        where: { userId: targetUserId, type: 'WITHDRAWAL' },
        _sum: { amount: true },
      })
    : { _sum: { amount: 0 } };

  const totalInvested = (deposits._sum.amount || 0) - (withdrawals._sum.amount || 0);
  const allTimeRoiPercent = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;

  // Real Return calculation in Euros and %
  const totalInflationEurosLoss = positionInflationEurosLoss + soldAssetsInflationEurosLoss;
  const realProfitEuros = totalProfit - totalInflationEurosLoss;
  const realRoiPercent = totalInvested > 0 ? (realProfitEuros / totalInvested) * 100 : 0;

  const formatBreakdown = (dict: Record<string, number>, total: number) => {
    return Object.entries(dict).map(([key, amount]) => ({
      name: key,
      amount,
      percentage: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0,
    }));
  };

  return {
    netWorth,
    cashBalance,
    totalInvested,
    openInvestedValue,
    soldProfit,
    totalProfit,
    allTimeRoiPercent,
    realProfitEuros,
    realRoiPercent,
    country,
    baseCurrency,
    breakdowns: {
      regions: formatBreakdown(regionTotals, netWorth),
      sectors: formatBreakdown(sectorTotals, netWorth),
      assetClasses: formatBreakdown(assetClassTotals, netWorth),
    },
    positions: positions.map((p) => ({
      id: p.id,
      symbol: p.symbol,
      name: p.name,
      assetClass: p.assetClass,
      region: p.region,
      sector: p.sector,
      quantity: p.quantity,
      investedAmount: p.investedAmount,
    })),
    soldAssets: soldAssetsWithInflation,
  };
}
