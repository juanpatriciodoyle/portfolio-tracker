import { db } from './db';
import { calculateHoldingPeriodInflation, syncCountryInflationHistory } from './inflationService';
import { contributionsInflationLoss, inflationLossAmount } from '../domain/inflation';
import { REFERENCE_EUR_RATES } from '../infrastructure/fx/referenceFxRates';
import type { PriceProvider } from '../application/ports';
import { noPrices } from '../infrastructure/market/marketPrices';
import { assertSaleCovered } from '../domain/holdingLedger';
import { costBasisOfSale, valueOpenPosition } from '../domain/openPosition';
import { summarizeReturn } from '../domain/portfolioReturn';
import { buildPortfolioHistory } from '../domain/portfolioHistory';

export interface ProcessTransactionParams {
  userId: string;
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

  const targetUserId = userId;

  // A sale needs the units to exist: checked before anything is written.
  if (type === 'SOLD' && userId) {
    const held = await db.transaction.findMany({
      where: { userId, symbol: symbol.toUpperCase(), type: { in: ['BOUGHT', 'SOLD'] } },
      select: { type: true, symbol: true, quantity: true, date: true },
    });
    assertSaleCovered(held, symbol, quantity, txDate);
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

    // Only the units sold take their share of the cost with them.
    const realizedCostBasis = existingPosition ? costBasisOfSale(existingPosition, quantity) : 0;
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

export async function getPortfolioOverview(userId: string, prices: PriceProvider = noPrices) {
  const targetUser = await db.user.findUnique({ where: { id: userId } });

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

  const priceBySymbol = await prices.pricesFor(positions.map((p) => p.symbol), baseCurrency);
  const valued = positions.map((position) => ({
    position,
    value: valueOpenPosition(position, priceBySymbol.get(position.symbol.toUpperCase()) ?? null),
  }));

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
  for (const { position: pos, value } of valued) {
    openInvestedValue += pos.investedAmount;
    regionTotals[pos.region] = (regionTotals[pos.region] || 0) + value.marketValue;
    sectorTotals[pos.sector] = (sectorTotals[pos.sector] || 0) + value.marketValue;
    assetClassTotals[pos.assetClass] = (assetClassTotals[pos.assetClass] || 0) + value.marketValue;

    // Time-weighted inflation from purchase date to today for open holding
    const inflationPercent = await calculateHoldingPeriodInflation(country, pos.createdAt, new Date());
    positionInflationEurosLoss += inflationLossAmount(pos.investedAmount, inflationPercent);
  }

  // Calculate per-sold-asset holding period inflation
  let soldAssetsInflationEurosLoss = 0;
  const soldAssetsWithInflation = [];
  for (const gain of realizedGains) {
    const inflationPercent = await calculateHoldingPeriodInflation(country, gain.createdAt, gain.date);
    const inflationLoss = inflationLossAmount(gain.investedAmount, inflationPercent);
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

  const soldProfit = realizedGains.reduce((sum, g) => sum + g.realizedPnl, 0);

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

  const feesAggregate = targetUserId
    ? await db.transaction.aggregate({
        where: { userId: targetUserId },
        _sum: { fee: true },
      })
    : { _sum: { fee: 0 } };

  const incomeAggregate = targetUserId
    ? await db.transaction.aggregate({
        where: { userId: targetUserId, type: 'DEPOSIT', notes: { contains: 'dividend' } },
        _sum: { amount: true },
      })
    : { _sum: { amount: 0 } };

  const buyFeesAggregate = targetUserId
    ? await db.transaction.aggregate({ where: { userId: targetUserId, type: 'BOUGHT' }, _sum: { fee: true } })
    : { _sum: { fee: 0 } };

  const totalFees = feesAggregate._sum.fee || 0;
  const totalIncome = incomeAggregate._sum.amount || 0;

  const totalInvested = (deposits._sum.amount || 0) - (withdrawals._sum.amount || 0);
  // Dividends arrive as deposits: they are earnings, not money the person put in.
  const summary = summarizeReturn({
    realizedPnl: soldProfit,
    dividends: totalIncome,
    buyFees: buyFeesAggregate._sum.fee || 0,
    contributed: totalInvested - totalIncome,
    openPositions: valued.map(({ value }) => value),
  });
  const netWorth = cashBalance + summary.openValue;
  const totalProfit = summary.totalReturn;
  const allTimeRoiPercent = summary.totalReturnPercent;

  // Real Return calculation in Euros and %
  const totalInflationEurosLoss = positionInflationEurosLoss + soldAssetsInflationEurosLoss;
  const realProfitEuros = totalProfit - totalInflationEurosLoss;
  const realRoiPercent = totalInvested > 0 ? (realProfitEuros / totalInvested) * 100 : 0;

  const CURRENCY_METADATA: Record<string, { name: string; symbol: string; rateToEur: number }> = {
    EUR: { name: 'Euro', symbol: '€', rateToEur: REFERENCE_EUR_RATES.EUR },
    USD: { name: 'US Dollar', symbol: '$', rateToEur: REFERENCE_EUR_RATES.USD },
    GBP: { name: 'British Pound', symbol: '£', rateToEur: REFERENCE_EUR_RATES.GBP },
    CHF: { name: 'Swiss Franc', symbol: 'CHF', rateToEur: REFERENCE_EUR_RATES.CHF },
    JPY: { name: 'Japanese Yen', symbol: '¥', rateToEur: REFERENCE_EUR_RATES.JPY },
    CAD: { name: 'Canadian Dollar', symbol: 'CA$', rateToEur: REFERENCE_EUR_RATES.CAD },
    AUD: { name: 'Australian Dollar', symbol: 'A$', rateToEur: REFERENCE_EUR_RATES.AUD },
  };

  const userTransactions = targetUserId
    ? await db.transaction.findMany({
        where: { userId: targetUserId },
      })
    : [];

  // Net worth in today's purchasing power: what each deposit lost since the day it went in (withdrawals take theirs away).
  const movedMoney = userTransactions.filter((tx) => tx.type === 'DEPOSIT' || tx.type === 'WITHDRAWAL');
  const inflationSince = new Map<number, number>();
  const now = new Date();
  for (const tx of movedMoney) {
    const day = tx.date.getTime();
    if (!inflationSince.has(day)) inflationSince.set(day, await calculateHoldingPeriodInflation(country, tx.date, now));
  }
  const realNetWorth =
    netWorth -
    contributionsInflationLoss(
      movedMoney.map((tx) => ({ amount: tx.type === 'DEPOSIT' ? tx.amount : -tx.amount, inflationPercent: inflationSince.get(tx.date.getTime()) ?? 0 }))
    );

  const cashByCurrency: Record<string, number> = {};

  for (const tx of userTransactions) {
    const curr = (tx.currency || baseCurrency || 'EUR').toUpperCase();
    if (tx.type === 'DEPOSIT') {
      cashByCurrency[curr] = (cashByCurrency[curr] || 0) + tx.amount;
    } else if (tx.type === 'WITHDRAWAL') {
      cashByCurrency[curr] = (cashByCurrency[curr] || 0) - tx.amount;
    } else if (tx.type === 'BOUGHT') {
      cashByCurrency[curr] = (cashByCurrency[curr] || 0) - (tx.amount + (tx.fee || 0));
    } else if (tx.type === 'SOLD') {
      cashByCurrency[curr] = (cashByCurrency[curr] || 0) + (tx.amount - (tx.fee || 0));
    }
  }

  // Fallback to cashBalance if no transaction-level currency breakdown exists
  if (Object.keys(cashByCurrency).length === 0 && cashBalance > 0) {
    cashByCurrency[baseCurrency] = cashBalance;
  }

  let totalReportingCash = 0;
  const cashBalances = Object.entries(cashByCurrency)
    .filter(([_, bal]) => Math.abs(bal) > 0.001)
    .map(([curr, bal]) => {
      const meta = CURRENCY_METADATA[curr] || { name: curr, symbol: curr, rateToEur: 1.0 };
      const baseRate = CURRENCY_METADATA[baseCurrency]?.rateToEur || 1.0;
      const rateToBase = (meta.rateToEur || 1.0) / baseRate;
      const balanceInReportingCurrency = bal * rateToBase;
      totalReportingCash += balanceInReportingCurrency;

      return {
        currency: curr,
        name: meta.name,
        currencySymbol: meta.symbol,
        balance: Math.round(bal * 100) / 100,
        balanceInReportingCurrency: Math.round(balanceInReportingCurrency * 100) / 100,
        percentage: 0,
      };
    });

  cashBalances.forEach((entry) => {
    entry.percentage =
      totalReportingCash > 0
        ? Math.round((entry.balanceInReportingCurrency / totalReportingCash) * 10000) / 100
        : 0;
  });

  cashBalances.sort((a, b) => b.balanceInReportingCurrency - a.balanceInReportingCurrency);

  const formatBreakdown = (dict: Record<string, number>, total: number) => {
    return Object.entries(dict).map(([key, amount]) => ({
      name: key,
      amount,
      percentage: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0,
    }));
  };

  return {
    netWorth,
    realNetWorth,
    cashBalance,
    cashBalances,
    totalInvested,
    openInvestedValue,
    openMarketValue: summary.openValue,
    soldProfit,
    openProfit: summary.unrealizedPnl,
    // The same two figures after the inflation lost while each asset was held (they add up to realProfitEuros with dividends and buying fees).
    realSoldProfit: soldProfit - soldAssetsInflationEurosLoss,
    realOpenProfit: summary.unrealizedPnl - positionInflationEurosLoss,
    dividends: totalIncome,
    pricesAvailable: summary.allPriced,
    totalProfit,
    totalFees,
    totalIncome,
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
    positions: valued.map(({ position: p, value }) => {
      const holdingDays = Math.max(
        1,
        Math.floor((new Date().getTime() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      );
      const costPerShare = p.quantity > 0 ? p.investedAmount / p.quantity : 0;
      return {
        id: p.id,
        symbol: p.symbol,
        name: p.name || p.symbol,
        assetClass: p.assetClass,
        region: p.region,
        sector: p.sector,
        quantity: p.quantity,
        investedAmount: p.investedAmount,
        costPerShare: Math.round(costPerShare * 100) / 100,
        currentPrice: value.priced && p.quantity > 0 ? Math.round((value.marketValue / p.quantity) * 100) / 100 : Math.round(costPerShare * 100) / 100,
        currentValue: value.marketValue,
        openProfit: value.unrealizedPnl,
        priced: value.priced,
        holdingDays,
        createdAt: p.createdAt,
      };
    }),
    soldAssets: soldAssetsWithInflation,
  };
}

export async function getPortfolioHistory(userId: string, prices: PriceProvider = noPrices) {
  const targetUser = await db.user.findUnique({ where: { id: userId } });

  if (!targetUser) return [];

  const transactions = await db.transaction.findMany({
    where: { userId: targetUser.id },
    orderBy: { date: 'asc' },
  });

  if (!transactions.length) {
    if (targetUser.cashBalance > 0) {
      return [
        {
          date_time: new Date().toISOString(),
          portfolio_value_in_reporting_currency: targetUser.cashBalance,
          cumulative_cost_in_reporting_currency: targetUser.cashBalance,
          cashflow_in_reporting_currency: targetUser.cashBalance,
          benchmark_value_in_reporting_currency: targetUser.cashBalance,
          cumulative_time_weighted_return_rate: 0,
          cumulative_benchmark_time_weighted_return_rate: 0,
        },
      ];
    }
    return [];
  }

  // Today's point is valued at market prices; the points before it stay at cost, as no price history is kept.
  const positions = await db.position.findMany({ where: { userId: targetUser.id } });
  const priceBySymbol = await prices.pricesFor(positions.map((p) => p.symbol), targetUser.baseCurrency);
  const openProfit = positions.reduce((sum, p) => sum + valueOpenPosition(p, priceBySymbol.get(p.symbol.toUpperCase()) ?? null).unrealizedPnl, 0);

  return buildPortfolioHistory(
    transactions.map((tx) => ({ type: tx.type, date: tx.date, symbol: tx.symbol, quantity: tx.quantity, amount: tx.amount, fee: tx.fee })),
    new Date(),
    { openPositionsUnrealizedPnl: openProfit }
  );
}

export interface PerformancePeriodItem {
  period_type: 'year' | 'month' | 'ttm';
  year: number;
  month: number | null;
  from_date: string;
  to_date: string;
  absolute_return_amount_in_reporting_currency: number;
  time_weighted_return_rate: number;
}

export async function getPortfolioPerformancePeriods(userId: string, prices: PriceProvider = noPrices): Promise<PerformancePeriodItem[]> {
  const targetUser = await db.user.findUnique({ where: { id: userId } });

  if (!targetUser) return [];

  const transactions = await db.transaction.findMany({
    where: { userId: targetUser.id },
    orderBy: { date: 'asc' },
  });

  const history = await getPortfolioHistory(userId, prices);
  if (!history || history.length === 0) return [];

  const getStateAt = (d: Date) => {
    const timestamp = d.getTime();
    let prev = history[0];
    for (const pt of history) {
      if (new Date(pt.date_time).getTime() <= timestamp) {
        prev = pt;
      } else {
        break;
      }
    }
    return prev;
  };

  const results: PerformancePeriodItem[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();

  const earliestDate = new Date(history[0].date_time);
  const minYear = Math.max(2020, earliestDate.getFullYear());

  for (let y = currentYear; y >= minYear; y--) {
    for (let m = 1; m <= 12; m++) {
      const fromDate = new Date(Date.UTC(y, m - 1, 1));
      const toDate = new Date(Date.UTC(y, m, 0, 23, 59, 59));

      if (fromDate.getTime() > now.getTime()) {
        continue;
      }

      const effectiveToDate = toDate.getTime() > now.getTime() ? now : toDate;

      const startState = getStateAt(fromDate);
      const endState = getStateAt(effectiveToDate);

      const netCashflow = transactions
        .filter((tx) => {
          const t = new Date(tx.date).getTime();
          return (
            t >= fromDate.getTime() &&
            t <= effectiveToDate.getTime() &&
            (tx.type === 'DEPOSIT' || tx.type === 'WITHDRAWAL')
          );
        })
        .reduce((acc, tx) => acc + (tx.type === 'DEPOSIT' ? tx.amount : -tx.amount), 0);

      const startVal = startState.portfolio_value_in_reporting_currency;
      const endVal = endState.portfolio_value_in_reporting_currency;
      const absoluteReturn = Math.round((endVal - startVal - netCashflow) * 100) / 100;

      const twrRate =
        startVal > 0
          ? absoluteReturn / startVal
          : netCashflow > 0
          ? absoluteReturn / netCashflow
          : 0;

      results.push({
        period_type: 'month',
        year: y,
        month: m,
        from_date: fromDate.toISOString(),
        to_date: effectiveToDate.toISOString(),
        absolute_return_amount_in_reporting_currency: absoluteReturn,
        time_weighted_return_rate: Math.round(twrRate * 10000) / 10000,
      });
    }

    const yearFromDate = new Date(Date.UTC(y, 0, 1));
    const yearToDate = new Date(Date.UTC(y, 11, 31, 23, 59, 59));
    const effectiveYearToDate = yearToDate.getTime() > now.getTime() ? now : yearToDate;

    const yStartState = getStateAt(yearFromDate);
    const yEndState = getStateAt(effectiveYearToDate);
    const yStartVal = yStartState.portfolio_value_in_reporting_currency;
    const yEndVal = yEndState.portfolio_value_in_reporting_currency;

    const yNetCashflow = transactions
      .filter((tx) => {
        const t = new Date(tx.date).getTime();
        return (
          t >= yearFromDate.getTime() &&
          t <= effectiveYearToDate.getTime() &&
          (tx.type === 'DEPOSIT' || tx.type === 'WITHDRAWAL')
        );
      })
      .reduce((acc, tx) => acc + (tx.type === 'DEPOSIT' ? tx.amount : -tx.amount), 0);

    const yAbsoluteReturn = Math.round((yEndVal - yStartVal - yNetCashflow) * 100) / 100;
    const yTwrRate =
      yStartVal > 0
        ? yAbsoluteReturn / yStartVal
        : yNetCashflow > 0
        ? yAbsoluteReturn / yNetCashflow
        : 0;

    results.push({
      period_type: 'year',
      year: y,
      month: null,
      from_date: yearFromDate.toISOString(),
      to_date: effectiveYearToDate.toISOString(),
      absolute_return_amount_in_reporting_currency: yAbsoluteReturn,
      time_weighted_return_rate: Math.round(yTwrRate * 10000) / 10000,
    });
  }

  const ttmFromDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const ttmStartState = getStateAt(ttmFromDate);
  const ttmEndState = getStateAt(now);
  const ttmStartVal = ttmStartState.portfolio_value_in_reporting_currency;
  const ttmEndVal = ttmEndState.portfolio_value_in_reporting_currency;

  const ttmNetCashflow = transactions
    .filter((tx) => {
      const t = new Date(tx.date).getTime();
      return (
        t >= ttmFromDate.getTime() &&
        t <= now.getTime() &&
        (tx.type === 'DEPOSIT' || tx.type === 'WITHDRAWAL')
      );
    })
    .reduce((acc, tx) => acc + (tx.type === 'DEPOSIT' ? tx.amount : -tx.amount), 0);

  const ttmAbsoluteReturn = Math.round((ttmEndVal - ttmStartVal - ttmNetCashflow) * 100) / 100;
  const ttmTwrRate =
    ttmStartVal > 0
      ? ttmAbsoluteReturn / ttmStartVal
      : ttmNetCashflow > 0
      ? ttmAbsoluteReturn / ttmNetCashflow
      : 0;

  results.push({
    period_type: 'ttm',
    year: currentYear,
    month: null,
    from_date: ttmFromDate.toISOString(),
    to_date: now.toISOString(),
    absolute_return_amount_in_reporting_currency: ttmAbsoluteReturn,
    time_weighted_return_rate: Math.round(ttmTwrRate * 10000) / 10000,
  });

  return results;
}

