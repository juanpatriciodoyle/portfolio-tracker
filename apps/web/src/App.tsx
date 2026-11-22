import { useState, useEffect, useMemo } from 'react';
import TransactionForm from './components/TransactionForm';
import Modal from './components/Modal';
import LoginModal from './components/LoginModal';
import AppHeader from './components/AppHeader';
import Reveal from './components/Reveal';
import InflationSettingsModal from './components/InflationSettingsModal';
import TransactionHistoryTable from './components/TransactionHistoryTable';
import ReportingPeriodBar from './components/ReportingPeriodBar';
import PortfolioChart from './components/PortfolioChart';
import HeroMetrics from './components/HeroMetrics';
import HoldingsTable, { type PositionItem, type SoldAssetItem } from './components/HoldingsTable';
import CashBalancesTable, { type CashBalanceItem } from './components/CashBalancesTable';
import PerformanceBreakdown from './components/PerformanceBreakdown';
import AllocationBreakdown from './components/AllocationBreakdown';
import ProfilePage from './components/profile/ProfilePage';
import { PROFILE_PATH, useHashRoute } from './hooks/useHashRoute';
import { type ChartDataPoint, type ReportingPeriod, type DateRange } from './data/sampleChartData';
import { authorizedFetch, readAuthToken } from './lib/authorizedFetch';
import { endGuestSession } from './lib/guestSession';
import { clearAllDrafts } from './lib/stepDraft';
import { returnForPeriod } from './lib/returnForPeriod';
import { greetingFor } from './lib/greeting';
import { describePeriodWindow } from './lib/periodWindow';
import { filterDataByPeriod } from './data/sampleChartData';

interface User {
  id: string;
  email: string;
  name?: string;
}

interface BreakdownItem {
  name: string;
  amount: number;
  percentage: number;
}

interface StatsData {
  netWorth: number;
  realNetWorth: number;
  cashBalance: number;
  totalInvested: number;
  openInvestedValue: number;
  openMarketValue: number;
  soldProfit: number;
  openProfit: number;
  realSoldProfit: number;
  realOpenProfit: number;
  dividends: number;
  pricesAvailable: boolean;
  totalProfit: number;
  totalFees?: number;
  totalIncome?: number;
  allTimeRoiPercent: number;
  realProfitEuros: number;
  realRoiPercent: number;
  annualInflationRate?: number;
  country: string;
  baseCurrency: string;
  breakdowns: {
    regions: BreakdownItem[];
    sectors: BreakdownItem[];
    assetClasses: BreakdownItem[];
  };
  positions: PositionItem[];
  soldAssets: SoldAssetItem[];
  cashBalances?: CashBalanceItem[];
}

function App() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('auth_user');
    return saved ? JSON.parse(saved) : null;
  });

  const { path, navigate } = useHashRoute();

  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isInflationModalOpen, setIsInflationModalOpen] = useState(false);
  const [isRealInflationMode, setIsRealInflationMode] = useState(false);
  const [tableKey, setTableKey] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [greeting] = useState(() => greetingFor(new Date().getHours()));

  const [period, setPeriod] = useState<ReportingPeriod>('All');
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);
  const [historyData, setHistoryData] = useState<ChartDataPoint[]>([]);

  const [stats, setStats] = useState<StatsData>({
    netWorth: 0,
    realNetWorth: 0,
    cashBalance: 0,
    totalInvested: 0,
    openInvestedValue: 0,
    openMarketValue: 0,
    openProfit: 0,
    realSoldProfit: 0,
    realOpenProfit: 0,
    dividends: 0,
    pricesAvailable: true,
    soldProfit: 0,
    totalProfit: 0,
    allTimeRoiPercent: 0,
    realProfitEuros: 0,
    realRoiPercent: 0,
    country: 'Spain',
    baseCurrency: 'EUR',
    breakdowns: { regions: [], sectors: [], assetClasses: [] },
    positions: [],
    soldAssets: [],
  });

  const getGreetingName = () => {
    if (!user) return 'Joe';
    if (
      user.email === 'demo@portfolio.local' ||
      user.name === 'Joe' ||
      user.name?.toLowerCase().includes('demo')
    ) {
      return 'Joe';
    }
    if (user.name && !['Passkey User', 'Passkey', 'Privacy User', 'User'].includes(user.name)) {
      return user.name.split(' ')[0];
    }
    if (user.email && !user.email.includes('privacy.local') && !user.email.includes('passkey.local')) {
      const raw = user.email.split('@')[0];
      if (raw.toLowerCase() === 'demo') {
        return 'Joe';
      }
      if (raw.toLowerCase() !== 'user' && raw.toLowerCase() !== 'passkey') {
        return raw.charAt(0).toUpperCase() + raw.slice(1);
      }
    }
    return user.name || 'Joe';
  };

  const fetchStats = async () => {
    try {
      const [statsRes, historyRes] = await Promise.all([
        authorizedFetch('/api/portfolio/stats'),
        authorizedFetch('/api/portfolio/history'),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
      if (historyRes.ok) {
        const hist = await historyRes.json();
        setHistoryData(hist);
      }
    } catch (err) {
      console.error('Failed to fetch portfolio data:', err);
    } finally {
      setHasLoaded(true);
    }
  };

  useEffect(() => {
    if (user) {
      fetchStats();
    }
  }, [user]);

  const handleLogout = () => {
    // The guest's reset needs the token: read it first, then drop it so signing out is instant.
    void endGuestSession(user, readAuthToken());
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    // Half-filled forms hold personal answers: they do not outlive the session.
    clearAllDrafts(sessionStorage);
    setUser(null);
  };

  const handleTransactionSuccess = () => {
    setIsLogOpen(false);
    fetchStats();
    setTableKey((prev) => prev + 1);
  };

  // Real live chart data from database
  const chartData = useMemo(() => {
    if (historyData && historyData.length > 0) {
      return historyData;
    }
    // Live real 0 baseline for accounts with 0 transactions
    return [
      {
        date_time: new Date().toISOString(),
        portfolio_value_in_reporting_currency: stats.netWorth,
        cumulative_cost_in_reporting_currency: stats.totalInvested,
        cashflow_in_reporting_currency: 0,
        benchmark_value_in_reporting_currency: stats.totalInvested,
        cumulative_time_weighted_return_rate: 0,
        cumulative_benchmark_time_weighted_return_rate: 0,
      },
    ];
  }, [historyData, stats.netWorth, stats.totalInvested]);

  if (!user) {
    return (
      <LoginModal
        onSuccess={(u) => {
          setUser(u);
          localStorage.setItem('auth_user', JSON.stringify(u));
        }}
      />
    );
  }

  if (path === PROFILE_PATH) {
    return <ProfilePage onBack={() => navigate('/')} onSignedOut={handleLogout} />;
  }

  const periodChange = returnForPeriod(chartData, period, customRange);
  const periodWindow = describePeriodWindow(filterDataByPeriod(chartData, period, customRange));

  // Active ROI and Profit Euros based on toggle state
  const activeProfitEuros = isRealInflationMode ? stats.realProfitEuros : stats.totalProfit;
  const activeRoiPercent = isRealInflationMode ? stats.realRoiPercent : stats.allTimeRoiPercent;

  return (
    <div className="app-shell">
      <AppHeader
        isRealInflationMode={isRealInflationMode}
        onToggleInflation={() => setIsRealInflationMode((on) => !on)}
        country={stats.country}
        onOpenCountry={() => setIsInflationModalOpen(true)}
        onLogTransaction={() => setIsLogOpen(true)}
        onOpenProfile={() => navigate(PROFILE_PATH)}
        onSignOut={handleLogout}
      />

      <main className="home">
        <div className="home__inner">
          <div className="home__lead">
          <h1 className="home__greeting">
            {greeting}, {getGreetingName()}
          </h1>

          {/* What you have and what it has earned: one place, then the period that changes it */}
          <HeroMetrics
            figures={{
              netWorth: stats.netWorth,
              realNetWorth: stats.realNetWorth,
              cashBalance: stats.cashBalance,
              openMarketValue: stats.openMarketValue,
              openCostBasis: stats.openInvestedValue,
              openProfit: stats.openProfit,
              realOpenProfit: stats.realOpenProfit,
              soldProfit: stats.soldProfit,
              realSoldProfit: stats.realSoldProfit,
              dividends: stats.dividends,
              totalFees: stats.totalFees ?? 0,
              totalGain: activeProfitEuros,
              totalGainPercent: activeRoiPercent,
              pricesAvailable: stats.pricesAvailable,
            }}
            period={period}
            periodGain={periodChange.gain}
            periodPercent={periodChange.percent}
            periodWindow={periodWindow}
            currency={stats.baseCurrency || 'EUR'}
            isRealInflationMode={isRealInflationMode}
            country={stats.country}
            loading={!hasLoaded}
          >
            <ReportingPeriodBar
              activePeriod={period}
              onPeriodChange={(p, range) => {
                setPeriod(p);
                if (range) setCustomRange(range);
              }}
              customRange={customRange}
            />
          </HeroMetrics>
          </div>

          {/* Interactive Multi-Mode Portfolio Chart */}
          <PortfolioChart
            data={chartData}
            period={period}
            customRange={customRange}
            currency={stats.baseCurrency || 'EUR'}
            userCashBalance={stats.cashBalance}
          />

          {/* Holdings Breakdown Table */}
          <HoldingsTable
            positions={stats.positions}
            soldAssets={stats.soldAssets}
            netWorth={stats.netWorth}
            currency={stats.baseCurrency || 'EUR'}
            isRealInflationMode={isRealInflationMode}
          />

          {/* Compact cash row */}
          <CashBalancesTable
            cashBalances={stats.cashBalances}
            cashBalance={stats.cashBalance}
            reportingCurrency={stats.baseCurrency || 'EUR'}
          />

          {/* Portfolio Allocation Breakdown (Donut Chart & Interactive Legend) */}
          <Reveal>
            <AllocationBreakdown
              breakdowns={stats.breakdowns}
              positions={stats.positions}
              cashBalance={stats.cashBalance}
              netWorth={stats.netWorth}
              currency={stats.baseCurrency || 'EUR'}
            />
          </Reveal>

          {/* Performance Breakdown (Bar Chart & Monthly Heatmap) */}
          <Reveal>
            <PerformanceBreakdown
              currency={stats.baseCurrency || 'EUR'}
              userId={user?.id}
            />
          </Reveal>

          {/* Transaction History Log Table */}
          <TransactionHistoryTable key={tableKey} userId={user?.id} />
        </div>
      </main>

      {/* Centered dialog for logging a transaction */}
      {isLogOpen && (
        <Modal label="Log Transaction" onClose={() => setIsLogOpen(false)}>
          <TransactionForm onSuccess={handleTransactionSuccess} positions={stats.positions} />
        </Modal>
      )}

      {/* Inflation Settings Modal */}
      {isInflationModalOpen && (
        <InflationSettingsModal
          currentCountry={stats.country}
          currentRate={stats.annualInflationRate || 2.8}
          onClose={() => setIsInflationModalOpen(false)}
          onUpdate={(country, rate) => {
            setStats((prev) => ({ ...prev, country, annualInflationRate: rate }));
            fetchStats();
          }}
        />
      )}
    </div>
  );
}

export default App;