import { useState, useEffect, useMemo } from 'react';
import { Plus, LogOut, Lock } from 'lucide-react';
import TransactionForm from './components/TransactionForm';
import SideDrawer from './components/SideDrawer';
import LoginModal from './components/LoginModal';
import InflationSettingsModal from './components/InflationSettingsModal';
import TransactionHistoryTable from './components/TransactionHistoryTable';
import ReportingPeriodBar from './components/ReportingPeriodBar';
import PortfolioChart from './components/PortfolioChart';
import PerformanceAnalysisGrid from './components/PerformanceAnalysisGrid';
import { type ChartDataPoint, type ReportingPeriod, type DateRange } from './data/sampleChartData';

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

interface PositionItem {
  id: string;
  symbol: string;
  name: string;
  assetClass: string;
  region: string;
  sector: string;
  investedAmount: number;
}

interface SoldAssetItem {
  id: string;
  symbol: string;
  assetClass: string;
  region: string;
  sector: string;
  investedAmount: number;
  returnedAmount: number;
  soldProfit: number;
  soldProfitPercent: number;
  holdingInflationPercent: number;
  realProfitEuros: number;
  date: string;
}

interface StatsData {
  netWorth: number;
  cashBalance: number;
  totalInvested: number;
  openInvestedValue: number;
  soldProfit: number;
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
}

function App() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('auth_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isInflationModalOpen, setIsInflationModalOpen] = useState(false);
  const [isRealInflationMode, setIsRealInflationMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'regions' | 'sectors' | 'assetClasses'>('regions');
  const [tableKey, setTableKey] = useState(0);

  const [period, setPeriod] = useState<ReportingPeriod>('All');
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);
  const [historyData, setHistoryData] = useState<ChartDataPoint[]>([]);

  const [stats, setStats] = useState<StatsData>({
    netWorth: 0,
    cashBalance: 0,
    totalInvested: 0,
    openInvestedValue: 0,
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
    if (!user) return 'Investor';
    if (user.name && !['Passkey User', 'Passkey', 'Privacy User', 'User'].includes(user.name)) {
      return user.name.split(' ')[0];
    }
    if (user.email && !user.email.includes('privacy.local') && !user.email.includes('passkey.local')) {
      const raw = user.email.split('@')[0];
      if (raw.toLowerCase() !== 'user' && raw.toLowerCase() !== 'passkey') {
        return raw.charAt(0).toUpperCase() + raw.slice(1);
      }
    }
    return user.name || 'Investor';
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const [statsRes, historyRes] = await Promise.all([
        fetch('/api/portfolio/stats', { headers }),
        fetch('/api/portfolio/history', { headers }),
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
    }
  };

  useEffect(() => {
    if (user) {
      fetchStats();
    }
  }, [user]);

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setUser(null);
  };

  const handleTransactionSuccess = () => {
    setIsDrawerOpen(false);
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

  // Active ROI and Profit Euros based on toggle state
  const activeProfitEuros = isRealInflationMode ? stats.realProfitEuros : stats.totalProfit;
  const activeRoiPercent = isRealInflationMode ? stats.realRoiPercent : stats.allTimeRoiPercent;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'var(--bg-canvas)' }}>
      {/* Header Navigation */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 40px',
          borderBottom: '1px solid #1E1E22',
          backgroundColor: 'var(--bg-card)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.5px', color: '#F4F4F5' }}>Portfolio Tracker</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Single Press Button for Inflation Adjustment */}
          <button
            onClick={() => setIsRealInflationMode(!isRealInflationMode)}
            style={{
              border: isRealInflationMode ? '1px solid #F4F4F5' : '1px solid #27272A',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: isRealInflationMode ? '#27272A' : '#161618',
              color: isRealInflationMode ? '#FFFFFF' : 'var(--text-secondary)',
            }}
          >
            <span>{isRealInflationMode ? 'Inflation Adjusted 🛡️' : 'Adjust for Inflation? 🎈'}</span>
          </button>

          {/* Resident Country Selector */}
          <button
            onClick={() => setIsInflationModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#161618',
              border: '1px solid #27272A',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '13px',
              color: '#F4F4F5',
              cursor: 'pointer',
            }}
          >
            <span>🇪🇸 {stats.country}</span>
          </button>

          {/* Primary Log Transaction Button (Energetic Blue) */}
          <button
            onClick={() => setIsDrawerOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              padding: '9px 16px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
            }}
          >
            <Plus size={16} /> Log Transaction
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              backgroundColor: '#161618',
              border: '1px solid #27272A',
              borderRadius: '8px',
              color: '#A1A1AA',
              cursor: 'pointer',
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main Dashboard Body */}
      <main style={{ flex: 1, padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <h1 style={{ fontSize: '26px', fontWeight: 700, margin: 0, letterSpacing: '-0.5px', color: '#F4F4F5' }}>
              How's the day going, {getGreetingName()}? 👋
            </h1>

            {/* Reporting Period Rail Toolbar */}
            <ReportingPeriodBar
              activePeriod={period}
              onPeriodChange={(p, range) => {
                setPeriod(p);
                if (range) setCustomRange(range);
              }}
              customRange={customRange}
            />
          </div>

          {/* Interactive Multi-Mode Portfolio Chart */}
          <PortfolioChart
            data={chartData}
            period={period}
            customRange={customRange}
            currency={stats.baseCurrency || 'EUR'}
            userCashBalance={stats.cashBalance}
          />

          {/* Performance Analysis Metric Grid (8 Tiles) */}
          <PerformanceAnalysisGrid
            stats={stats}
            historyData={chartData}
            period={period}
            isRealInflationMode={isRealInflationMode}
          />

          {/* Metric Overview Cards (3 Cards) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px' }}>
            {/* Card 1: Net Worth */}
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <span>Net Worth</span>
              </div>
              <div style={cardValueStyle}>€{stats.netWorth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div style={{ fontSize: '12px', color: '#A1A1AA', marginTop: '4px' }}>
                Cash: €{stats.cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            {/* Card 2: Profit from Sold Assets */}
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <span>Profit from Sold Assets</span>
              </div>
              <div style={{ ...cardValueStyle, color: stats.soldProfit >= 0 ? '#10B981' : '#F43F5E' }}>
                {stats.soldProfit >= 0 ? '+' : ''}€{stats.soldProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '12px', color: '#A1A1AA', marginTop: '4px' }}>
                Total earnings locked from closed trades
              </div>
            </div>

            {/* Card 3: All-Time Return */}
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <span>All-Time Return</span>
              </div>
              <div style={{ ...cardValueStyle, color: activeProfitEuros >= 0 ? '#10B981' : '#F43F5E' }}>
                {activeProfitEuros >= 0 ? '+' : ''}€{activeProfitEuros.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '12px', color: '#A1A1AA', marginTop: '4px' }}>
                Return: {activeRoiPercent >= 0 ? '+' : ''}{activeRoiPercent.toFixed(2)}% {isRealInflationMode ? `(${stats.country} inflation adj.)` : '(standard)'}
              </div>
            </div>
          </div>

          {/* Allocation & Geographic Distribution */}
          <div style={{ backgroundColor: 'var(--bg-card)', border: 'var(--border-card)', borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1E1E22', paddingBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#F4F4F5' }}>
                Asset & Regional Allocation
              </h3>
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['regions', 'sectors', 'assetClasses'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: '1px solid #27272A',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                      backgroundColor: activeTab === tab ? '#F4F4F5' : '#161618',
                      color: activeTab === tab ? '#000000' : '#A1A1AA',
                    }}
                  >
                    {tab === 'assetClasses' ? 'Asset Classes' : tab}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {stats.breakdowns[activeTab].length === 0 ? (
                <div style={{ color: '#A1A1AA', fontSize: '13px', padding: '12px 0', textAlign: 'center' }}>
                  No allocation data logged yet. Click <strong>Log Transaction</strong> to start.
                </div>
              ) : (
                stats.breakdowns[activeTab].map((item) => (
                  <div key={item.name} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 500 }}>
                      <span style={{ color: '#F4F4F5' }}>{item.name}</span>
                      <span style={{ color: '#A1A1AA' }}>
                        €{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ({item.percentage}%)
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '6px', backgroundColor: '#1E1E22', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(item.percentage, 100)}%`,
                          backgroundColor: '#E4E4E7',
                          borderRadius: '3px',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Open Active Positions */}
          {stats.positions.length > 0 && (
            <div style={{ backgroundColor: 'var(--bg-card)', border: 'var(--border-card)', borderRadius: '14px', padding: '20px' }}>
              <h3 style={{ margin: '0 0 14px 0', fontSize: '16px', fontWeight: 600, color: '#F4F4F5' }}>
                Active Open Investments ({stats.positions.length})
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1E1E22', color: '#A1A1AA', fontSize: '11px', textTransform: 'uppercase' }}>
                      <th style={{ padding: '10px 14px' }}>Symbol</th>
                      <th style={{ padding: '10px 14px' }}>Asset Class</th>
                      <th style={{ padding: '10px 14px' }}>Region / Sector</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>Money Invested (€)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.positions.map((pos) => (
                      <tr key={pos.id} style={{ borderBottom: '1px solid #1E1E22' }}>
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: '#F4F4F5' }}>{pos.symbol}</td>
                        <td style={{ padding: '12px 14px', color: '#A1A1AA' }}>{pos.assetClass}</td>
                        <td style={{ padding: '12px 14px', color: '#A1A1AA' }}>{pos.region} • {pos.sector}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: '#F4F4F5' }}>
                          €{pos.investedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sold Assets Profit Table */}
          {stats.soldAssets.length > 0 && (
            <div style={{ backgroundColor: 'var(--bg-card)', border: 'var(--border-card)', borderRadius: '14px', padding: '20px' }}>
              <h3 style={{ margin: '0 0 14px 0', fontSize: '16px', fontWeight: 600, color: '#F4F4F5', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Lock size={16} color="#10B981" /> Profit from Sold Assets ({stats.soldAssets.length})
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1E1E22', color: '#A1A1AA', fontSize: '11px', textTransform: 'uppercase' }}>
                      <th style={{ padding: '10px 14px' }}>Date Sold</th>
                      <th style={{ padding: '10px 14px' }}>Symbol</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>Money Invested</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>Money Received</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>Profit (€)</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>Holding Inflation</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>Real Profit (€)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.soldAssets.map((gain) => (
                      <tr key={gain.id} style={{ borderBottom: '1px solid #1E1E22' }}>
                        <td style={{ padding: '12px 14px', color: '#A1A1AA' }}>
                          {new Date(gain.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: '#F4F4F5' }}>{gain.symbol}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: '#A1A1AA' }}>
                          €{gain.investedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: '#F4F4F5' }}>
                          €{gain.returnedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: gain.soldProfit >= 0 ? '#10B981' : '#F43F5E' }}>
                          {gain.soldProfit >= 0 ? '+' : ''}€{gain.soldProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({gain.soldProfitPercent.toFixed(1)}%)
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: '#A1A1AA' }}>
                          {gain.holdingInflationPercent.toFixed(1)}%
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: gain.realProfitEuros >= 0 ? '#10B981' : '#F43F5E' }}>
                          {gain.realProfitEuros >= 0 ? '+' : ''}€{gain.realProfitEuros.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Transaction History Log Table */}
          <TransactionHistoryTable key={tableKey} />
        </div>
      </main>

      {/* Side Drawer Modal for Logging Transaction */}
      <SideDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)}>
        <TransactionForm onSuccess={handleTransactionSuccess} />
      </SideDrawer>

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

const cardStyle = {
  backgroundColor: 'var(--bg-card)',
  border: 'var(--border-card)',
  borderRadius: '14px',
  padding: '20px',
  display: 'flex',
  flexDirection: 'column' as const,
  justifyContent: 'space-between',
};

const cardHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: '12px',
  fontWeight: 600,
  color: '#A1A1AA',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
};

const cardValueStyle = {
  fontSize: '24px',
  fontWeight: 700,
  color: '#F4F4F5',
  letterSpacing: '-0.5px',
  marginTop: '10px',
};

export default App;