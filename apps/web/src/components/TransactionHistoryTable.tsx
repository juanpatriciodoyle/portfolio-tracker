import { useState, useEffect } from 'react';
import { History, ArrowUpRight, ArrowDownLeft, PlusCircle, MinusCircle, Search, Filter } from 'lucide-react';
import { authorizedFetch } from '../lib/authorizedFetch';
import { formatCurrency } from '../data/sampleChartData';
import { dataLabel } from '../i18n/dataLabels';
import { useTranslation } from '../i18n/useTranslation';
import { displayLocale } from '../lib/money';
import { paginate } from '../lib/pagination';

const PAGE_SIZE = 5;

export interface TransactionLog {
  id: string;
  type: 'BOUGHT' | 'SOLD' | 'DEPOSIT' | 'WITHDRAWAL';
  symbol: string;
  name?: string;
  assetClass: string;
  region: string;
  sector: string;
  amount: number;
  fee: number;
  totalAmount: number;
  currency: string;
  date: string;
}

interface TransactionHistoryTableProps {
  userId?: string;
}

export default function TransactionHistoryTable({ userId }: TransactionHistoryTableProps) {
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState<TransactionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [pageIndex, setPageIndex] = useState(0);

  const fetchTransactions = async () => {
    try {
      const res = await authorizedFetch('/api/transactions');
      if (res.ok) {
        const data = await res.json();
        setTransactions(data);
      }
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [userId]);

  const filtered = [...transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .filter((tx) => {
    const matchesSearch =
      tx.symbol.toLowerCase().includes(search.toLowerCase()) ||
      tx.region.toLowerCase().includes(search.toLowerCase()) ||
      tx.sector.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === 'ALL' || tx.type === filterType;
    return matchesSearch && matchesType;
  });
  const page = paginate(filtered, pageIndex, PAGE_SIZE);

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'BOUGHT':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, backgroundColor: 'var(--color-profit-bg)', color: 'var(--color-profit)' }}>
            <ArrowUpRight size={14} /> {t('tx.type.bought')}
          </span>
        );
      case 'SOLD':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, backgroundColor: 'var(--color-loss-bg)', color: 'var(--color-loss)' }}>
            <ArrowDownLeft size={14} /> {t('tx.type.sold')}
          </span>
        );
      case 'DEPOSIT':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, backgroundColor: 'rgba(133, 77, 14, 0.25)', color: 'var(--color-benchmark)' }}>
            <PlusCircle size={14} /> {t('tx.type.deposit')}
          </span>
        );
      case 'WITHDRAWAL':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, backgroundColor: 'rgba(245, 158, 11, 0.15)', color: 'var(--color-warning)' }}>
            <MinusCircle size={14} /> {t('tx.type.withdraw')}
          </span>
        );
      default:
        return <span>{type}</span>;
    }
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--bg-card)',
        border: 'var(--border-card)',
        borderRadius: '14px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-primary)',
            }}
          >
            <History size={20} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('history.title')}
            </h3>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
              {t('history.subtitle')}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          {/* Search Bar */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={15} color="var(--text-secondary)" style={{ position: 'absolute', left: '12px' }} />
            <input
              type="text"
              placeholder={t('history.searchPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPageIndex(0);
              }}
              style={{
                padding: '8px 12px 8px 34px',
                borderRadius: '8px',
                border: '1px solid var(--border-card-color)',
                backgroundColor: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none',
                width: '220px',
              }}
            />
          </div>

          {/* Filter Dropdown */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Filter size={14} color="var(--text-secondary)" style={{ position: 'absolute', left: '10px' }} />
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value);
                setPageIndex(0);
              }}
              style={{
                padding: '8px 12px 8px 30px',
                borderRadius: '8px',
                border: '1px solid var(--border-card-color)',
                backgroundColor: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="ALL">{t('history.filter.all')}</option>
              <option value="BOUGHT">{t('history.filter.bought')}</option>
              <option value="SOLD">{t('history.filter.sold')}</option>
              <option value="DEPOSIT">{t('history.filter.deposits')}</option>
              <option value="WITHDRAWAL">{t('history.filter.withdrawals')}</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-secondary)' }}>{t('history.loading')}</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '24px 0', textAlign: 'center' }}>
          {t('history.emptyBefore')}
          <strong>{t('header.logTransaction')}</strong>
          {t('history.emptyAfter')}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-card-color)', color: 'var(--text-secondary)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <th style={{ padding: '10px 14px' }}>{t('history.col.date')}</th>
                <th style={{ padding: '10px 14px' }}>{t('history.col.action')}</th>
                <th style={{ padding: '10px 14px' }}>{t('history.col.symbol')}</th>
                <th style={{ padding: '10px 14px' }}>{t('history.col.assetClass')}</th>
                <th style={{ padding: '10px 14px' }}>{t('history.col.regionSector')}</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>{t('history.col.fee')}</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>{t('history.col.total')}</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((tx) => (
                <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-divider-color)' }}>
                  <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {new Date(tx.date).toLocaleDateString(displayLocale(), { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td style={{ padding: '12px 14px' }}>{getTypeBadge(tx.type)}</td>
                  <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{tx.symbol}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{dataLabel(t, 'assetClass', tx.assetClass)}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                    {dataLabel(t, 'region', tx.region)} • <span style={{ color: 'var(--text-primary)' }}>{dataLabel(t, 'sector', tx.sector)}</span>
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {formatCurrency(tx.fee, 'EUR')}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {formatCurrency(tx.amount, 'EUR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && page.pageCount > 1 && (
        <nav aria-label={t('history.pages')} className="history-pager">
          <button type="button" className="dashboard-flat-button" disabled={!page.hasPrevious} onClick={() => setPageIndex(page.page - 1)}>
            {t('history.previous')}
          </button>
          <span className="history-pager__status">
            {t('history.pageOf', { page: page.page + 1, total: page.pageCount })}
          </span>
          <button type="button" className="dashboard-flat-button" disabled={!page.hasNext} onClick={() => setPageIndex(page.page + 1)}>
            {t('history.next')}
          </button>
        </nav>
      )}
    </div>
  );
}
