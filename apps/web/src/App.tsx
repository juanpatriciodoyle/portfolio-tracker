import { useState } from 'react';
import { Plus, LayoutDashboard, Wallet, Percent, LogOut, ChevronUp, ChevronDown } from 'lucide-react';
import TransactionForm from './components/TransactionForm';
import SideDrawer from './components/SideDrawer';
import PortfolioShip from './components/PortfolioShip';
import LoginModal from './components/LoginModal';

interface User {
  id: string;
  email: string;
}

function App() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('auth_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCommandDeckOpen, setIsCommandDeckOpen] = useState(false);
  const [roi30d, setRoi30d] = useState(5.8);
  const [cashRatio, setCashRatio] = useState(15);
  const [netWorth, setNetWorth] = useState(124500);
  const [activeTab, setActiveTab] = useState<'regions' | 'sectors' | 'instruments'>('regions');

  const setDemoState = (roi: number, cash: number, worth: number) => {
    setRoi30d(roi);
    setCashRatio(cash);
    setNetWorth(worth);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('auth_user');
  };

  if (!user) {
    return <LoginModal onSuccess={(u) => { setUser(u); localStorage.setItem('auth_user', JSON.stringify(u)); }} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'var(--bg-canvas)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 40px',
          borderBottom: '1px solid #1F1F23',
          backgroundColor: 'var(--bg-card)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                fontWeight: 800,
                fontSize: '18px',
              }}
            >
              P
            </div>
            <span style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.5px' }}>Portfolio</span>
          </div>

          <nav style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <a
              href="#"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: 'var(--text-primary)',
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              <LayoutDashboard size={16} /> Dashboard
            </a>
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginLeft: 'auto' }}>
          <button
            onClick={() => setIsDrawerOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'var(--accent-primary)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 16px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 12px rgba(0, 102, 255, 0.2)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#1A75FF';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 102, 255, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--accent-primary)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 102, 255, 0.2)';
            }}
          >
            <Plus size={16} /> Log Transaction
          </button>

          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '38px',
              height: '38px',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid #1F1F23',
              borderRadius: '8px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
              e.currentTarget.style.color = 'var(--color-danger)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.color = 'var(--text-secondary)';
              e.currentTarget.style.borderColor = '#1F1F23';
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main style={{ flex: 1, padding: '40px', display: 'flex', flexDirection: 'column', gap: '32px', paddingBottom: '120px' }}>
        <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto' }}>
          <div style={{ marginBottom: '40px' }}>
            <h1 style={{ fontSize: '32px', fontWeight: 700, margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>
              Dashboard Overview
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>
              Cross-Asset Regional Allocation Engine
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
              gap: '24px',
              alignItems: 'start',
              marginBottom: '32px',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
                padding: '32px',
                backgroundColor: 'var(--bg-card)',
                border: 'var(--border-card)',
                borderRadius: '16px',
                height: '280px',
                justifyContent: 'center',
                position: 'relative',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
                  Net Worth
                </div>
                <div style={{ fontSize: '48px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-1.5px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Wallet size={36} color="var(--accent-primary)" />
                  €{netWorth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '48px', borderTop: '1px solid #1F1F23', paddingTop: '20px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    30-Day Change
                  </div>
                  <div
                    style={{
                      fontSize: '18px',
                      fontWeight: 700,
                      color: roi30d >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Percent size={16} />
                    {roi30d >= 0 ? '+' : ''}
                    {roi30d.toFixed(2)}%
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Cash Reserves
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {cashRatio}%
                  </div>
                </div>
              </div>
            </div>

            <PortfolioShip roi30d={roi30d} cashRatio={cashRatio} />
          </div>

          <div
            style={{
              padding: '32px',
              border: 'var(--border-card)',
              borderRadius: '16px',
              backgroundColor: 'var(--bg-card)',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #1F1F23',
                paddingBottom: '16px',
              }}
            >
              <h2
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  margin: 0,
                  letterSpacing: '-0.5px',
                }}
              >
                Regional Cargo Allocation
              </h2>

              <div
                style={{
                  display: 'flex',
                  backgroundColor: '#080808',
                  border: '1px solid #1F1F23',
                  borderRadius: '8px',
                  padding: '4px',
                }}
              >
                <button
                  onClick={() => setActiveTab('regions')}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: activeTab === 'regions' ? 'var(--accent-primary)' : 'transparent',
                    color: activeTab === 'regions' ? '#FFFFFF' : 'var(--text-secondary)',
                    transition: 'all 0.2s ease',
                    boxShadow: activeTab === 'regions' ? '0 2px 8px rgba(0, 102, 255, 0.3)' : 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== 'regions') {
                      e.currentTarget.style.color = 'var(--text-primary)';
                      e.currentTarget.style.boxShadow = '0 0 8px rgba(255, 255, 255, 0.05)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== 'regions') {
                      e.currentTarget.style.color = 'var(--text-secondary)';
                      e.currentTarget.style.boxShadow = 'none';
                    }
                  }}
                >
                  Regions
                </button>
                <button
                  onClick={() => setActiveTab('sectors')}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: activeTab === 'sectors' ? 'var(--accent-primary)' : 'transparent',
                    color: activeTab === 'sectors' ? '#FFFFFF' : 'var(--text-secondary)',
                    transition: 'all 0.2s ease',
                    boxShadow: activeTab === 'sectors' ? '0 2px 8px rgba(0, 102, 255, 0.3)' : 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== 'sectors') {
                      e.currentTarget.style.color = 'var(--text-primary)';
                      e.currentTarget.style.boxShadow = '0 0 8px rgba(255, 255, 255, 0.05)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== 'sectors') {
                      e.currentTarget.style.color = 'var(--text-secondary)';
                      e.currentTarget.style.boxShadow = 'none';
                    }
                  }}
                >
                  Sectors
                </button>
                <button
                  onClick={() => setActiveTab('instruments')}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: activeTab === 'instruments' ? 'var(--accent-primary)' : 'transparent',
                    color: activeTab === 'instruments' ? '#FFFFFF' : 'var(--text-secondary)',
                    transition: 'all 0.2s ease',
                    boxShadow: activeTab === 'instruments' ? '0 2px 8px rgba(0, 102, 255, 0.3)' : 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== 'instruments') {
                      e.currentTarget.style.color = 'var(--text-primary)';
                      e.currentTarget.style.boxShadow = '0 0 8px rgba(255, 255, 255, 0.05)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== 'instruments') {
                      e.currentTarget.style.color = 'var(--text-secondary)';
                      e.currentTarget.style.boxShadow = 'none';
                    }
                  }}
                >
                  Instruments
                </button>
              </div>
            </div>

            <div
              style={{
                padding: '48px 24px',
                textAlign: 'center',
                border: '1px dashed #1F1F23',
                borderRadius: '12px',
                backgroundColor: 'rgba(8, 8, 8, 0.3)',
                color: 'var(--text-secondary)',
                fontSize: '14px',
              }}
            >
              Interactive cargo allocation chart and regional geographical maps will be rendered here.
            </div>
          </div>
        </div>
      </main>

      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'rgba(18, 18, 20, 0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderTop: '1px solid #1F1F23',
          zIndex: 40,
          transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          transform: isCommandDeckOpen ? 'translateY(0)' : 'translateY(calc(100% - 48px))',
        }}
      >
        <div
          onClick={() => setIsCommandDeckOpen(!isCommandDeckOpen)}
          style={{
            height: '48px',
            padding: '0 40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            borderBottom: isCommandDeckOpen ? '1px solid #1F1F23' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--accent-primary)', boxShadow: '0 0 8px var(--accent-primary)' }} />
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '1px', textTransform: 'uppercase' }}>
              Command Deck (Debug)
            </span>
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            {isCommandDeckOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </div>
        </div>

        <div style={{ padding: '24px 40px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setDemoState(8.5, 10, 135200)}
            style={{
              backgroundColor: roi30d === 8.5 ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.02)',
              color: roi30d === 8.5 ? '#FFFFFF' : 'var(--text-primary)',
              border: roi30d === 8.5 ? '1px solid var(--accent-primary)' : '1px solid #1F1F23',
              borderRadius: '8px',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            🚀 Fast Sailing
          </button>
          <button
            onClick={() => setDemoState(2.1, 12, 124500)}
            style={{
              backgroundColor: roi30d === 2.1 ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.02)',
              color: roi30d === 2.1 ? '#FFFFFF' : 'var(--text-primary)',
              border: roi30d === 2.1 ? '1px solid var(--accent-primary)' : '1px solid #1F1F23',
              borderRadius: '8px',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            ⛵ Smooth Sailing
          </button>
          <button
            onClick={() => setDemoState(-4.5, 15, 118400)}
            style={{
              backgroundColor: roi30d === -4.5 ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.02)',
              color: roi30d === -4.5 ? '#FFFFFF' : 'var(--text-primary)',
              border: roi30d === -4.5 ? '1px solid var(--accent-primary)' : '1px solid #1F1F23',
              borderRadius: '8px',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            🌊 Choppy Waters
          </button>
          <button
            onClick={() => setDemoState(1.2, 65, 126100)}
            style={{
              backgroundColor: cashRatio === 65 ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.02)',
              color: cashRatio === 65 ? '#FFFFFF' : 'var(--text-primary)',
              border: cashRatio === 65 ? '1px solid var(--accent-primary)' : '1px solid #1F1F23',
              borderRadius: '8px',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            ⚓ Cargo Overload
          </button>
          <button
            onClick={() => setDemoState(-18.0, 8, 102000)}
            style={{
              backgroundColor: roi30d === -18.0 ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.02)',
              color: roi30d === -18.0 ? '#FFFFFF' : 'var(--text-primary)',
              border: roi30d === -18.0 ? '1px solid var(--accent-primary)' : '1px solid #1F1F23',
              borderRadius: '8px',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            🚨 Sunk Alert
          </button>
        </div>
      </div>

      <SideDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)}>
        <TransactionForm onSuccess={() => setIsDrawerOpen(false)} />
      </SideDrawer>
    </div>
  );
}

export default App;