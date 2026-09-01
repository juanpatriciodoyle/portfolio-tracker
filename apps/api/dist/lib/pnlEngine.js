"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processTransaction = processTransaction;
exports.getPortfolioOverview = getPortfolioOverview;
exports.getPortfolioHistory = getPortfolioHistory;
exports.getPortfolioPerformancePeriods = getPortfolioPerformancePeriods;
const db_1 = require("./db");
const inflationService_1 = require("./inflationService");
async function processTransaction(params) {
    const { userId, type, symbol, name, assetClass = 'Stock', region = 'Europe', sector = 'Technology', quantity = 1.0, amount, fee = 0, currency = 'EUR', notes, date, } = params;
    const totalAmount = amount + (type === 'BOUGHT' ? fee : -fee);
    const txDate = date ? new Date(date) : new Date();
    let targetUserId = userId;
    if (!targetUserId) {
        const adminUser = await db_1.db.user.findFirst();
        if (adminUser) {
            targetUserId = adminUser.id;
        }
    }
    // 1. Log Transaction
    const transaction = await db_1.db.transaction.create({
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
    if (!targetUserId)
        return transaction;
    const user = await db_1.db.user.findUnique({ where: { id: targetUserId } });
    if (!user)
        return transaction;
    // 2. Perform Cash Accounting & Open Position Updates
    if (type === 'DEPOSIT') {
        await db_1.db.user.update({
            where: { id: targetUserId },
            data: { cashBalance: { increment: amount } },
        });
    }
    else if (type === 'WITHDRAWAL') {
        await db_1.db.user.update({
            where: { id: targetUserId },
            data: { cashBalance: { decrement: amount } },
        });
    }
    else if (type === 'BOUGHT') {
        const totalOutflow = amount + fee;
        await db_1.db.user.update({
            where: { id: targetUserId },
            data: { cashBalance: { decrement: totalOutflow } },
        });
        const existingPosition = await db_1.db.position.findFirst({
            where: { userId: targetUserId, symbol: symbol.toUpperCase() },
        });
        if (existingPosition) {
            await db_1.db.position.update({
                where: { id: existingPosition.id },
                data: {
                    quantity: existingPosition.quantity + quantity,
                    investedAmount: existingPosition.investedAmount + amount,
                    updatedAt: new Date(),
                },
            });
        }
        else {
            await db_1.db.position.create({
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
    }
    else if (type === 'SOLD') {
        const netInflow = amount - fee;
        await db_1.db.user.update({
            where: { id: targetUserId },
            data: { cashBalance: { increment: netInflow } },
        });
        const existingPosition = await db_1.db.position.findFirst({
            where: { userId: targetUserId, symbol: symbol.toUpperCase() },
        });
        const costBasis = existingPosition ? existingPosition.investedAmount : amount;
        const realizedCostBasis = Math.min(costBasis, amount);
        const realizedPnl = netInflow - realizedCostBasis;
        const realizedPnlPercent = realizedCostBasis > 0 ? (realizedPnl / realizedCostBasis) * 100 : 0;
        await db_1.db.realizedGain.create({
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
                await db_1.db.position.delete({ where: { id: existingPosition.id } });
            }
            else {
                await db_1.db.position.update({
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
async function getPortfolioOverview(userId) {
    let targetUser = null;
    if (userId) {
        targetUser = await db_1.db.user.findUnique({ where: { id: userId } });
    }
    else {
        targetUser = await db_1.db.user.findFirst();
    }
    const cashBalance = targetUser ? targetUser.cashBalance : 0;
    const country = targetUser ? targetUser.country : 'Spain';
    const baseCurrency = targetUser ? targetUser.baseCurrency : 'EUR';
    const targetUserId = targetUser ? targetUser.id : undefined;
    // Sync country inflation history for country
    await (0, inflationService_1.syncCountryInflationHistory)(country);
    const positions = targetUserId
        ? await db_1.db.position.findMany({
            where: { userId: targetUserId },
        })
        : [];
    const realizedGains = targetUserId
        ? await db_1.db.realizedGain.findMany({
            where: { userId: targetUserId },
            orderBy: { date: 'desc' },
        })
        : [];
    let openInvestedValue = 0;
    const regionTotals = {};
    const sectorTotals = {};
    const assetClassTotals = {};
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
        const inflationPercent = await (0, inflationService_1.calculateHoldingPeriodInflation)(country, pos.createdAt, new Date());
        positionInflationEurosLoss += pos.investedAmount * (inflationPercent / 100);
    }
    // Calculate per-sold-asset holding period inflation
    let soldAssetsInflationEurosLoss = 0;
    const soldAssetsWithInflation = [];
    for (const gain of realizedGains) {
        const inflationPercent = await (0, inflationService_1.calculateHoldingPeriodInflation)(country, gain.createdAt, gain.date);
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
        ? await db_1.db.transaction.aggregate({
            where: { userId: targetUserId, type: 'DEPOSIT' },
            _sum: { amount: true },
        })
        : { _sum: { amount: 0 } };
    const withdrawals = targetUserId
        ? await db_1.db.transaction.aggregate({
            where: { userId: targetUserId, type: 'WITHDRAWAL' },
            _sum: { amount: true },
        })
        : { _sum: { amount: 0 } };
    const feesAggregate = targetUserId
        ? await db_1.db.transaction.aggregate({
            where: { userId: targetUserId },
            _sum: { fee: true },
        })
        : { _sum: { fee: 0 } };
    const incomeAggregate = targetUserId
        ? await db_1.db.transaction.aggregate({
            where: { userId: targetUserId, type: 'DEPOSIT', notes: { contains: 'dividend' } },
            _sum: { amount: true },
        })
        : { _sum: { amount: 0 } };
    const totalFees = feesAggregate._sum.fee || 0;
    const totalIncome = incomeAggregate._sum.amount || 0;
    const totalInvested = (deposits._sum.amount || 0) - (withdrawals._sum.amount || 0);
    const allTimeRoiPercent = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;
    // Real Return calculation in Euros and %
    const totalInflationEurosLoss = positionInflationEurosLoss + soldAssetsInflationEurosLoss;
    const realProfitEuros = totalProfit - totalInflationEurosLoss;
    const realRoiPercent = totalInvested > 0 ? (realProfitEuros / totalInvested) * 100 : 0;
    const CURRENCY_METADATA = {
        EUR: { name: 'Euro', symbol: '€', rateToEur: 1.0 },
        USD: { name: 'US Dollar', symbol: '$', rateToEur: 0.86236 },
        GBP: { name: 'British Pound', symbol: '£', rateToEur: 1.176 },
        CHF: { name: 'Swiss Franc', symbol: 'CHF', rateToEur: 1.052 },
        JPY: { name: 'Japanese Yen', symbol: '¥', rateToEur: 0.0061 },
        CAD: { name: 'Canadian Dollar', symbol: 'CA$', rateToEur: 0.68 },
        AUD: { name: 'Australian Dollar', symbol: 'A$', rateToEur: 0.61 },
    };
    const userTransactions = targetUserId
        ? await db_1.db.transaction.findMany({
            where: { userId: targetUserId },
        })
        : [];
    const cashByCurrency = {};
    for (const tx of userTransactions) {
        const curr = (tx.currency || baseCurrency || 'EUR').toUpperCase();
        if (tx.type === 'DEPOSIT') {
            cashByCurrency[curr] = (cashByCurrency[curr] || 0) + tx.amount;
        }
        else if (tx.type === 'WITHDRAWAL') {
            cashByCurrency[curr] = (cashByCurrency[curr] || 0) - tx.amount;
        }
        else if (tx.type === 'BOUGHT') {
            cashByCurrency[curr] = (cashByCurrency[curr] || 0) - (tx.amount + (tx.fee || 0));
        }
        else if (tx.type === 'SOLD') {
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
    const formatBreakdown = (dict, total) => {
        return Object.entries(dict).map(([key, amount]) => ({
            name: key,
            amount,
            percentage: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0,
        }));
    };
    return {
        netWorth,
        cashBalance,
        cashBalances,
        totalInvested,
        openInvestedValue,
        soldProfit,
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
        positions: positions.map((p) => {
            const holdingDays = Math.max(1, Math.floor((new Date().getTime() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24)));
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
                currentPrice: Math.round(costPerShare * 100) / 100,
                currentValue: p.investedAmount,
                holdingDays,
                createdAt: p.createdAt,
            };
        }),
        soldAssets: soldAssetsWithInflation,
    };
}
async function getPortfolioHistory(userId) {
    let targetUser = null;
    if (userId) {
        targetUser = await db_1.db.user.findUnique({ where: { id: userId } });
    }
    else {
        targetUser = await db_1.db.user.findFirst();
    }
    if (!targetUser)
        return [];
    const transactions = await db_1.db.transaction.findMany({
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
    const points = [];
    let runningCash = 0;
    let runningInvestedInPositions = 0;
    let cumulativeNetContributions = 0;
    let cumulativeRealizedPnl = 0;
    const positionCostMap = new Map();
    for (const tx of transactions) {
        const txDate = new Date(tx.date);
        let cashflow = 0;
        if (tx.type === 'DEPOSIT') {
            runningCash += tx.amount;
            cumulativeNetContributions += tx.amount;
            cashflow = tx.amount;
        }
        else if (tx.type === 'WITHDRAWAL') {
            runningCash -= tx.amount;
            cumulativeNetContributions -= tx.amount;
            cashflow = -tx.amount;
        }
        else if (tx.type === 'BOUGHT') {
            const outflow = tx.amount + (tx.fee || 0);
            runningCash -= outflow;
            const currentCost = positionCostMap.get(tx.symbol) || 0;
            positionCostMap.set(tx.symbol, currentCost + tx.amount);
            runningInvestedInPositions += tx.amount;
        }
        else if (tx.type === 'SOLD') {
            const inflow = tx.amount - (tx.fee || 0);
            runningCash += inflow;
            const currentCost = positionCostMap.get(tx.symbol) || tx.amount;
            const realizedBasis = Math.min(currentCost, tx.amount);
            const gain = inflow - realizedBasis;
            cumulativeRealizedPnl += gain;
            positionCostMap.set(tx.symbol, Math.max(0, currentCost - realizedBasis));
            runningInvestedInPositions = Math.max(0, runningInvestedInPositions - realizedBasis);
        }
        const portfolioValue = Math.max(0, runningCash + runningInvestedInPositions + cumulativeRealizedPnl);
        const twr = cumulativeNetContributions > 0
            ? (portfolioValue - cumulativeNetContributions) / cumulativeNetContributions
            : 0;
        points.push({
            date_time: txDate.toISOString(),
            portfolio_value_in_reporting_currency: Math.round(portfolioValue * 100) / 100,
            cumulative_cost_in_reporting_currency: Math.round(cumulativeNetContributions * 100) / 100,
            cashflow_in_reporting_currency: Math.round(cashflow * 100) / 100,
            benchmark_value_in_reporting_currency: Math.round(cumulativeNetContributions * 1.05 * 100) / 100,
            cumulative_time_weighted_return_rate: Math.round(twr * 10000) / 10000,
            cumulative_benchmark_time_weighted_return_rate: 0.05,
        });
    }
    const now = new Date();
    const lastPt = points[points.length - 1];
    if (lastPt && new Date(lastPt.date_time).toDateString() !== now.toDateString()) {
        points.push({
            ...lastPt,
            date_time: now.toISOString(),
            cashflow_in_reporting_currency: 0,
        });
    }
    return points;
}
async function getPortfolioPerformancePeriods(userId) {
    let targetUser = null;
    if (userId) {
        targetUser = await db_1.db.user.findUnique({ where: { id: userId } });
    }
    else {
        targetUser = await db_1.db.user.findFirst();
    }
    if (!targetUser)
        return [];
    const transactions = await db_1.db.transaction.findMany({
        where: { userId: targetUser.id },
        orderBy: { date: 'asc' },
    });
    const history = await getPortfolioHistory(userId);
    if (!history || history.length === 0)
        return [];
    const getStateAt = (d) => {
        const timestamp = d.getTime();
        let prev = history[0];
        for (const pt of history) {
            if (new Date(pt.date_time).getTime() <= timestamp) {
                prev = pt;
            }
            else {
                break;
            }
        }
        return prev;
    };
    const results = [];
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
                return (t >= fromDate.getTime() &&
                    t <= effectiveToDate.getTime() &&
                    (tx.type === 'DEPOSIT' || tx.type === 'WITHDRAWAL'));
            })
                .reduce((acc, tx) => acc + (tx.type === 'DEPOSIT' ? tx.amount : -tx.amount), 0);
            const startVal = startState.portfolio_value_in_reporting_currency;
            const endVal = endState.portfolio_value_in_reporting_currency;
            const absoluteReturn = Math.round((endVal - startVal - netCashflow) * 100) / 100;
            const twrRate = startVal > 0
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
            return (t >= yearFromDate.getTime() &&
                t <= effectiveYearToDate.getTime() &&
                (tx.type === 'DEPOSIT' || tx.type === 'WITHDRAWAL'));
        })
            .reduce((acc, tx) => acc + (tx.type === 'DEPOSIT' ? tx.amount : -tx.amount), 0);
        const yAbsoluteReturn = Math.round((yEndVal - yStartVal - yNetCashflow) * 100) / 100;
        const yTwrRate = yStartVal > 0
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
        return (t >= ttmFromDate.getTime() &&
            t <= now.getTime() &&
            (tx.type === 'DEPOSIT' || tx.type === 'WITHDRAWAL'));
    })
        .reduce((acc, tx) => acc + (tx.type === 'DEPOSIT' ? tx.amount : -tx.amount), 0);
    const ttmAbsoluteReturn = Math.round((ttmEndVal - ttmStartVal - ttmNetCashflow) * 100) / 100;
    const ttmTwrRate = ttmStartVal > 0
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
