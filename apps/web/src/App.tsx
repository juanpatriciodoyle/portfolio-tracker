import { useState, useEffect } from 'react';
import { Plus, LogOut, Lock, Lightbulb, LightbulbOff } from 'lucide-react';
import TransactionForm from './components/TransactionForm';
import SideDrawer from './components/SideDrawer';
import LoginModal from './components/LoginModal';
import InflationSettingsModal from './components/InflationSettingsModal';
import TransactionHistoryTable from './components/TransactionHistoryTable';

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

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved === 'light' ? 'light' : 'dark') as 'dark' | 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

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
    if (!user) return 'Richard';
    if (user.name && !['Passkey User', 'Passkey', 'Privacy User', 'User'].includes(user.name)) {
      return user.name.split(' ')[0];
    }
    if (user.email && !user.email.includes('privacy.local') && !user.email.includes('passkey.local')) {
      const raw = user.email.split('@')[0];
      if (raw.toLowerCase() !== 'user' && raw.toLowerCase() !== 'passkey') {
        return raw.charAt(0).toUpperCase() + raw.slice(1);
      }
    }
    return 'Richard';
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch('/api/portfolio/stats', { headers });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch portfolio stats:', err);
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
  // Value coloring helper: render neutral 0 in primary text color, non-zero positive in jade, negative in garnet
  const getValueColor = (val: number) => {
    if (val === 0) return 'var(--text-primary)';
    return val > 0 ? 'var(--color-jade)' : 'var(--wealth-garnet)';
  };

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
          borderBottom: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-surface)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>Portfolio Tracker</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Header Pill: Inflation Adjustment */}
          <button
            onClick={() => setIsRealInflationMode(!isRealInflationMode)}
            style={{
              border: isRealInflationMode ? '1px solid rgba(197, 160, 89, 0.4)' : '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'var(--bg-surface)',
              color: isRealInflationMode ? '#C5A059' : 'var(--text-secondary)',
              transition: 'all 0.2s ease',
            }}
          >
            <span>{isRealInflationMode ? 'Inflation Adjusted 🛡️' : 'Adjust for Inflation? 🎈'}</span>
          </button>

          {/* Header Pill: Resident Country Selector */}
          <button
            onClick={() => setIsInflationModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <span>🇪🇸 {stats.country}</span>
          </button>

          {/* Primary Log Transaction CTA Button (Refactored Spec) */}
          <button
            onClick={() => setIsDrawerOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid rgba(197, 160, 89, 0.4)',
              color: '#C5A059',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#C5A059';
              e.currentTarget.style.color = theme === 'dark' ? '#0B0C0E' : '#FFFFFF';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
              e.currentTarget.style.color = '#C5A059';
            }}
          >
            <Plus size={16} /> Log Transaction
          </button>

          {/* Light Bulb Theme Toggle Button (Icon only, turned on in dark mode, off in light mode) */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            aria-label={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {theme === 'dark' ? (
              <Lightbulb size={18} fill="#C5A059" color="#C5A059" />
            ) : (
              <LightbulbOff size={18} color="#64748B" />
            )}
          </button>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main Dashboard Body */}
      <main style={{ flex: 1, padding: '36px 40px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
        <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '28px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 700, margin: 0, letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>
              How's the day going, {getGreetingName()}? 👋
            </h1>
          </div>

          {/* Metric Overview Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px' }}>
            {/* Card 1: Net Worth */}
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <span>Net Worth</span>
              </div>
              <div style={cardValueStyle}>€{stats.netWorth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Cash: €{stats.cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            {/* Card 2: Profit from Sold Assets */}
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <span>Profit from Sold Assets</span>
              </div>
              <div style={{ ...cardValueStyle, color: getValueColor(stats.soldProfit) }}>
                {stats.soldProfit > 0 ? '+' : ''}€{stats.soldProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Total earnings locked from closed trades
              </div>
            </div>

            {/* Card 3: All-Time Return */}
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <span>All-Time Return</span>
              </div>
              <div style={{ ...cardValueStyle, color: getValueColor(activeProfitEuros) }}>
                {activeProfitEuros > 0 ? '+' : ''}€{activeProfitEuros.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Return: {activeRoiPercent > 0 ? '+' : ''}{activeRoiPercent.toFixed(2)}% {isRealInflationMode ? `(${stats.country} inflation adj.)` : '(standard)'}
              </div>
            </div>
          </div>

          {/* Allocation & Geographic Distribution */}
          <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Asset & Regional Allocation
              </h3>
              {/* Segmented Control Container */}
              <div style={{ backgroundColor: 'var(--bg-canvas)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {(['regions', 'sectors', 'assetClasses'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: activeTab === tab ? 600 : 500,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                      backgroundColor: activeTab === tab ? 'var(--bg-surface)' : 'transparent',
                      color: activeTab === tab ? '#C5A059' : 'var(--text-secondary)',
                      border: activeTab === tab ? '1px solid rgba(197, 160, 89, 0.4)' : '1px solid transparent',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {tab === 'assetClasses' ? 'Asset Classes' : tab}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {stats.breakdowns[activeTab].length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '12px 0', textAlign: 'center' }}>
                  No allocation data logged yet. Click <strong>Log Transaction</strong> to start.
                </div>
              ) : (
                stats.breakdowns[activeTab].map((item) => (
                  <div key={item.name} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 500 }}>
                      <span style={{ color: 'var(--text-primary)' }}>{item.name}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        €{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ({item.percentage}%)
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-card-inner)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(item.percentage, 100)}%`,
                          backgroundColor: 'var(--wealth-brass)',
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
            <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '20px' }}>
              <h3 style={{ margin: '0 0 14px 0', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Active Open Investments ({stats.positions.length})
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase' }}>
                      <th style={{ padding: '10px 14px' }}>Symbol</th>
                      <th style={{ padding: '10px 14px' }}>Asset Class</th>
                      <th style={{ padding: '10px 14px' }}>Region / Sector</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right' }}>Money Invested (€)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.positions.map((pos) => (
                      <tr key={pos.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{pos.symbol}</td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{pos.assetClass}</td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{pos.region} • {pos.sector}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>
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
            <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '20px' }}>
              <h3 style={{ margin: '0 0 14px 0', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Lock size={16} color="var(--color-jade)" /> Profit from Sold Assets ({stats.soldAssets.length})
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase' }}>
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
                      <tr key={gain.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                          {new Date(gain.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{gain.symbol}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                          €{gain.investedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--text-primary)' }}>
                          €{gain.returnedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: gain.soldProfit >= 0 ? 'var(--color-jade)' : 'var(--wealth-garnet)' }}>
                          {gain.soldProfit >= 0 ? '+' : ''}€{gain.soldProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({gain.soldProfitPercent.toFixed(1)}%)
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {gain.holdingInflationPercent.toFixed(1)}%
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: gain.realProfitEuros >= 0 ? 'var(--color-jade)' : 'var(--wealth-garnet)' }}>
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
  border: '1px solid var(--border-color)',
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
  color: 'var(--text-secondary)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
};

const cardValueStyle = {
  fontSize: '24px',
  fontWeight: 700,
  color: 'var(--text-primary)',
  letterSpacing: '-0.5px',
  marginTop: '10px',
};

export default App;