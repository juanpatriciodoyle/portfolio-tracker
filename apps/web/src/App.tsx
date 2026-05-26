import TransactionForm from './components/TransactionForm';

function App() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '20px' }}>
      <header style={{ textAlign: 'center', padding: '20px 0', borderBottom: '1px solid #e2e8f0', marginBottom: '40px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Portfolio Tracker</h1>
        <p style={{ color: '#64748b', marginTop: '4px' }}>MVP Cross-Asset Regional Allocation Engine</p>
      </header>
      <main>
        <TransactionForm />
      </main>
    </div>
  );
}

export default App;