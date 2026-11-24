import { useState } from 'react';
import { useTranslation } from './i18n/useTranslation';
import TransactionForm from './components/TransactionForm';
import Modal from './components/Modal';
import LoginModal from './components/LoginModal';
import AppHeader from './components/AppHeader';
import Reveal from './components/Reveal';
import InflationSettingsModal from './components/InflationSettingsModal';
import TransactionHistoryTable from './components/TransactionHistoryTable';
import ReportingPeriodBar from './components/ReportingPeriodBar';
import PortfolioChart from './components/PortfolioChart';
import FirstTransaction from './components/FirstTransaction';
import HomeLoadError from './components/HomeLoadError';
import GoalsStrip from './components/GoalsStrip';
import HeroMetrics from './components/HeroMetrics';
import HoldingsTable from './components/HoldingsTable';
import CashBalancesTable from './components/CashBalancesTable';
import AllocationBreakdown from './components/AllocationBreakdown';
import ProfilePage from './components/profile/ProfilePage';
import { PROFILE_PATH, useHashRoute } from './hooks/useHashRoute';
import { useHomeGoals } from './hooks/useHomeGoals';
import { clearPortfolioCache, usePortfolio } from './hooks/usePortfolio';
import { filterDataByPeriod, type ReportingPeriod, type DateRange } from './data/sampleChartData';
import { readAuthToken } from './lib/authorizedFetch';
import { endGuestSession } from './lib/guestSession';
import { mayAddPasskey } from './lib/passkeys';
import { clearStoredUser, readStoredUser, writeStoredUser } from './lib/storedUser';
import AddPasskeyButton from './components/AddPasskeyButton';
import SkipLink, { MAIN_CONTENT_ID } from './components/SkipLink';
import type { SignedInUserDto } from './contracts';
import { clearAllDrafts } from './lib/stepDraft';
import { availablePeriods } from './lib/periodAvailability';
import { returnForPeriod } from './lib/returnForPeriod';
import { greetingFor } from './lib/greeting';
import { describePeriodWindow } from './lib/periodWindow';
import { homeView } from './lib/emptyAccount';
import { cashHeldIn } from './lib/transactionRows';
import { heroInsights } from './lib/heroInsights';
import { intlLocale } from './i18n/locale';

/** The person signed in. `isAdmin` is only ever true after the administrator signs in with Google: it decides what is shown, the server decides what is allowed. */
type User = SignedInUserDto;

function App() {
  const { t, locale } = useTranslation();
  const [user, setUser] = useState<User | null>(readStoredUser);

  const { path, navigate } = useHashRoute();

  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isInflationModalOpen, setIsInflationModalOpen] = useState(false);
  const [isRealInflationMode, setIsRealInflationMode] = useState(false);
  const [tableKey, setTableKey] = useState(0);
  const [hour] = useState(() => new Date().getHours());

  const [period, setPeriod] = useState<ReportingPeriod>('All');
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);

  const { stats, history: historyData, status, fromMemory, refresh, applyCountry } = usePortfolio(user !== null);
  // A brand-new account has nothing to draw: home asks for a first transaction instead (and has no goals to measure yet).
  const view = homeView(status, stats);
  const emptyAccount = view === 'first-transaction';
  // The first-transaction dialog opens by itself; closing it leaves the quiet empty state, and the next visit opens it again.
  const [firstDialogDismissed, setFirstDialogDismissed] = useState(false);
  const homeGoals = useHomeGoals(user !== null && (view === 'portfolio'), stats.netWorth);

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

  const handleLogout = () => {
    // The guest's reset needs the token: read it first, then drop it so signing out is instant.
    void endGuestSession(user, readAuthToken());
    localStorage.removeItem('auth_token');
    clearStoredUser();
    // Half-filled forms hold personal answers: they do not outlive the session.
    clearAllDrafts(sessionStorage);
    // The same goes for the last figures shown: nobody's portfolio is left in memory for the next person.
    clearPortfolioCache();
    setUser(null);
  };

  const handleTransactionSuccess = () => {
    setIsLogOpen(false);
    refresh();
    setTableKey((prev) => prev + 1);
  };

  // The line is made of real readings only (see `GET /api/portfolio/history`); with fewer than two the chart says it starts today.
  const chartData = historyData.points;

  if (!user) {
    return (
      <LoginModal
        onSuccess={(u) => {
          setUser(u);
          writeStoredUser(u);
        }}
      />
    );
  }

  if (path === PROFILE_PATH) {
    return (
      <ProfilePage
        onBack={() => navigate('/')}
        onSignedOut={handleLogout}
        isAdmin={user.isAdmin === true}
        accountName={getGreetingName()}
        onLogTransaction={() => {
          navigate('/');
          setIsLogOpen(true);
        }}
      />
    );
  }

  // A window is offered only when real readings reach back to its start: one that no longer holds falls back to "All".
  const windows = availablePeriods(historyData.realFrom, new Date());
  const activePeriod: ReportingPeriod = windows.includes(period) ? period : 'All';
  const periodChange = returnForPeriod(chartData, activePeriod, customRange);
  const periodWindow = describePeriodWindow(filterDataByPeriod(chartData, activePeriod, customRange), locale);

  const insights = heroInsights({
    positions: stats.positions,
    soldAssets: stats.soldAssets,
    totalProfit: stats.totalProfit,
    moneyPutIn: stats.moneyPutIn,
    pricesAvailable: stats.pricesAvailable,
    nominalPercent: stats.allTimeRoiPercent,
    realPercent: stats.realRoiPercent,
    history: historyData,
    period: activePeriod,
    isRealInflationMode,
    currency: stats.baseCurrency || 'EUR',
    locale: intlLocale(locale),
    t,
    today: new Date(),
  });

  // Active ROI and Profit Euros based on toggle state
  const activeProfitEuros = isRealInflationMode ? stats.realProfitEuros : stats.totalProfit;
  const activeRoiPercent = isRealInflationMode ? stats.realRoiPercent : stats.allTimeRoiPercent;

  return (
    <div className="app-shell">
      <SkipLink />
      <AppHeader
        isRealInflationMode={isRealInflationMode}
        onToggleInflation={() => setIsRealInflationMode((on) => !on)}
        country={stats.country}
        onOpenCountry={() => setIsInflationModalOpen(true)}
        onLogTransaction={() => setIsLogOpen(true)}
        onOpenProfile={() => navigate(PROFILE_PATH)}
        onSignOut={handleLogout}
        isGuest={user?.isGuest === true}
        passkeyAction={
          mayAddPasskey(user) ? (
            <AddPasskeyButton
              label={user.email ?? user.name}
              hasPasskey={user.hasPasskey}
              onAdded={() => {
                const next = { ...user, hasPasskey: true };
                setUser(next);
                writeStoredUser(next);
              }}
            />
          ) : undefined
        }
      />

      <main className="home" id={MAIN_CONTENT_ID} tabIndex={-1}>
        <div className="home__inner">
          <div className="home__lead">
          <h1 className="home__greeting">
            {greetingFor(hour, t)}, {getGreetingName()}
          </h1>

          {view === 'failed' && <HomeLoadError onRetry={refresh} />}

          {emptyAccount && (
            <FirstTransaction
              open={!firstDialogDismissed}
              currency={stats.baseCurrency || 'EUR'}
              onSaved={handleTransactionSuccess}
              onOpenProfile={() => navigate(PROFILE_PATH)}
              onDismiss={() => setFirstDialogDismissed(true)}
              onOpen={() => setFirstDialogDismissed(false)}
            />
          )}

          {/* What you have and what it has earned: one place; the period that changes it sits above the chart */}
          {(view === 'loading' || view === 'portfolio') && (
          <HeroMetrics
            figures={{
              netWorth: stats.netWorth,
              realNetWorth: stats.realNetWorth,
              cashBalance: stats.cashBalance,
              moneyPutIn: stats.moneyPutIn,
              openMarketValue: stats.openMarketValue,
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
            period={activePeriod}
            periodGain={periodChange.gain}
            periodPercent={periodChange.percent}
            currency={stats.baseCurrency || 'EUR'}
            isRealInflationMode={isRealInflationMode}
            country={stats.country}
            loading={view === 'loading'}
            settled={fromMemory}
            story={insights.story}
            inflation={insights.inflation}
            inflationRate={stats.annualInflationRate}
          />
          )}
          </div>

          {view === 'portfolio' && (
            <>
              {/* What the person keeps, and what the portfolio could pay */}
              <GoalsStrip goals={homeGoals} onOpenProfile={() => navigate(PROFILE_PATH)} />

              {/* The value over time, with the period picker in its header row */}
              <PortfolioChart
                data={chartData}
                period={activePeriod}
                customRange={customRange}
                currency={stats.baseCurrency || 'EUR'}
                periodNote={activePeriod === 'All' ? undefined : periodWindow}
                periodBar={
                  <ReportingPeriodBar
                    activePeriod={activePeriod}
                    available={windows}
                    realFrom={historyData.realFrom}
                    onPeriodChange={(p, range) => {
                      setPeriod(p);
                      if (range) setCustomRange(range);
                    }}
                    customRange={customRange}
                  />
                }
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
                netWorth={stats.netWorth}
                inflationRatePercent={stats.annualInflationRate}
                country={stats.country}
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

              {/* Transaction History Log Table */}
              <TransactionHistoryTable key={tableKey} userId={user?.id} cashBalances={stats.cashBalances} onChanged={refresh} />
            </>
          )}
        </div>
      </main>

      {/* Centered dialog for logging a transaction */}
      {isLogOpen && (
        <Modal label={t('header.logTransaction')} onClose={() => setIsLogOpen(false)}>
          <TransactionForm
            onSuccess={handleTransactionSuccess}
            positions={stats.positions}
            currency={stats.baseCurrency || 'EUR'}
            cashAvailable={cashHeldIn(stats.cashBalances, stats.baseCurrency || 'EUR')}
          />
        </Modal>
      )}

      {/* Inflation Settings Modal */}
      {isInflationModalOpen && (
        <InflationSettingsModal
          currentCountry={stats.country}
          currentRate={stats.annualInflationRate || 2.8}
          onClose={() => setIsInflationModalOpen(false)}
          onUpdate={applyCountry}
        />
      )}
    </div>
  );
}

export default App;