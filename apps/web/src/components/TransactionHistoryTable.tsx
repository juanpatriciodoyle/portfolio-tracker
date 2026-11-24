import { useCallback, useState, useEffect, useRef } from 'react';
import { History, ArrowUpRight, ArrowDownLeft, PlusCircle, MinusCircle, Search, Filter } from 'lucide-react';
import { authorizedFetch } from '../lib/authorizedFetch';
import { formatCurrency } from '../data/sampleChartData';
import { dataLabel } from '../i18n/dataLabels';
import { useTranslation } from '../i18n/useTranslation';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { NARROW_SCREEN_QUERY } from '../lib/breakpoints';
import { displayLocale } from '../lib/money';
import { cashHeldIn, type EditableTransaction } from '../lib/transactionRows';
import Modal from './Modal';
import TransactionForm from './TransactionForm';
import TransactionRowActions from './TransactionRowActions';
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
  /** Units bought or sold; a deposit or withdrawal has one. */
  quantity?: number;
  amount: number;
  fee: number;
  totalAmount: number;
  currency: string;
  date: string;
  /** A buy that drew on the cash the person holds instead of bringing new money. */
  paidWithCash?: boolean;
}

interface TransactionHistoryTableProps {
  userId?: string;
  /** What is held in cash, by currency: a purchase being corrected can be paid with it. */
  cashBalances?: readonly { currency: string; balance: number }[];
  /** A transaction was corrected or removed: the figures of the home screen moved. */
  onChanged?: () => void;
}

export default function TransactionHistoryTable({ userId, cashBalances, onChanged }: TransactionHistoryTableProps) {
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState<TransactionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [pageIndex, setPageIndex] = useState(0);
  const isNarrow = useMediaQuery(NARROW_SCREEN_QUERY);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<EditableTransaction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  // A row that disappears takes the focus with it: the heading keeps the keyboard where the history is.
  const afterChange = (message: string) => {
    setNotice(message);
    reload();
    heading.current?.focus();
  };
  const deleted = () => {
    afterChange(t('history.deleted'));
    onChanged?.();
  };
  const stale = () => afterChange(t('history.gone'));
  const corrected = () => {
    setEditing(null);
    afterChange(t('history.updated'));
    onChanged?.();
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await authorizedFetch('/api/transactions');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setTransactions(data);
        }
      } catch (err) {
        console.error('Failed to fetch transactions:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

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
  /** Every amount in the currency it was recorded in. */
  const money = (amount: number, tx: TransactionLog) => formatCurrency(amount, tx.currency || 'EUR');
  const dayOf = (tx: TransactionLog) => new Date(tx.date).toLocaleDateString(displayLocale(), { month: 'short', day: 'numeric', year: 'numeric' });

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'BOUGHT':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, backgroundColor: 'var(--color-profit-bg)', color: 'var(--color-profit)' }}>
            <ArrowUpRight size={14} /> {t('tx.type.bought')}
          </span>
        );
      case 'SOLD':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, backgroundColor: 'var(--color-loss-bg)', color: 'var(--color-loss)' }}>
            <ArrowDownLeft size={14} /> {t('tx.type.sold')}
          </span>
        );
      case 'DEPOSIT':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, backgroundColor: 'rgba(133, 77, 14, 0.25)', color: 'var(--color-benchmark)' }}>
            <PlusCircle size={14} /> {t('tx.type.deposit')}
          </span>
        );
      case 'WITHDRAWAL':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, backgroundColor: 'rgba(245, 158, 11, 0.15)', color: 'var(--color-warning)' }}>
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
            <h3 ref={heading} tabIndex={-1} style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', outline: 'none' }}>
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
              className="history-search"
              aria-label={t('history.searchPlaceholder')}
              placeholder={t('history.searchPlaceholder')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPageIndex(0);
              }}
            />
          </div>

          {/* Filter Dropdown */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Filter size={14} color="var(--text-secondary)" style={{ position: 'absolute', left: '10px' }} />
            <select
              className="history-filter"
              aria-label={t('history.filter.label')}
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value);
                setPageIndex(0);
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

      <p role="status" className="history-notice">
        {notice}
      </p>

      {loading ? (
        <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-secondary)' }}>{t('history.loading')}</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: '13px', padding: '24px 0', textAlign: 'center' }}>
          {t('history.emptyBefore')}
          <strong>{t('header.logTransaction')}</strong>
          {t('history.emptyAfter')}
        </div>
      ) : (
        isNarrow ? (
          <ul className="tx-cards">
            {page.items.map((tx) => (
              <li key={tx.id} className="tx-card">
                <div className="tx-card__top">
                  <span className="tx-card__symbol">{tx.symbol}</span>
                  {getTypeBadge(tx.type)}
                </div>
                <span className="tx-card__amount">{money(tx.amount, tx)}</span>
                <p className="tx-card__meta">
                  {dayOf(tx)} · {dataLabel(t, 'assetClass', tx.assetClass)} · {dataLabel(t, 'region', tx.region)} · {dataLabel(t, 'sector', tx.sector)}
                </p>
                {tx.fee > 0 && (
                  <p className="tx-card__fee">
                    {t('history.col.fee')}: {money(tx.fee, tx)}
                  </p>
                )}
                <div className="tx-card__actions">
                  <TransactionRowActions tx={tx} onEdit={setEditing} onDeleted={deleted} onStale={stale} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-card-color)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <th style={{ padding: '10px 14px' }}>{t('history.col.date')}</th>
                <th style={{ padding: '10px 14px' }}>{t('history.col.action')}</th>
                <th style={{ padding: '10px 14px' }}>{t('history.col.symbol')}</th>
                <th style={{ padding: '10px 14px' }}>{t('history.col.assetClass')}</th>
                <th style={{ padding: '10px 14px' }}>{t('history.col.regionSector')}</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>{t('history.col.fee')}</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>{t('history.col.total')}</th>
                <th style={{ padding: '10px 14px' }}>
                  <span className="visually-hidden">{t('history.col.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((tx) => (
                <tr key={tx.id} className="tx-row" style={{ borderBottom: '1px solid var(--border-divider-color)' }}>
                  <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {dayOf(tx)}
                  </td>
                  <td style={{ padding: '12px 14px' }}>{getTypeBadge(tx.type)}</td>
                  <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{tx.symbol}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{dataLabel(t, 'assetClass', tx.assetClass)}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                    {dataLabel(t, 'region', tx.region)} • <span style={{ color: 'var(--text-primary)' }}>{dataLabel(t, 'sector', tx.sector)}</span>
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {money(tx.fee, tx)}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {money(tx.amount, tx)}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <TransactionRowActions tx={tx} onEdit={setEditing} onDeleted={deleted} onStale={stale} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )
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

      {editing && (
        <Modal label={t('tx.editTitle')} onClose={() => setEditing(null)}>
          <TransactionForm
            editing={editing}
            currency={editing.currency || 'EUR'}
            cashAvailable={cashHeldIn(cashBalances, editing.currency || 'EUR') + (editing.paidWithCash ? editing.amount + editing.fee : 0)}
            onSuccess={corrected}
            onStale={reload}
          />
        </Modal>
      )}
    </div>
  );
}
