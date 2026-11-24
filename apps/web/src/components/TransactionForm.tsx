import { useId, useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { ArrowUpRight, ArrowDownLeft, PlusCircle, MinusCircle, Calendar, Search } from 'lucide-react';
import { authorizedFetch } from '../lib/authorizedFetch';
import { intlLocale } from '../i18n/locale';
import { currencyExponent, formatMinor } from '../lib/money';
import { correctionOf, type EditableTransaction } from '../lib/transactionRows';
import { ASSET_CLASSES, normalizeAssetClass, sectorOf } from '../lib/assetClasses';
import CurrencyIcon from './CurrencyIcon';
import MoneyInput from './MoneyInput';
import { useSubmitOnce } from '../hooks/useSubmitOnce';
import OwnedHoldingPicker from './OwnedHoldingPicker';
import { dataLabel } from '../i18n/dataLabels';
import { useTranslation } from '../i18n/useTranslation';
import { knownServerMessage, serverMessage } from '../lib/serverMessages';
import { checkSaleQuantity, formatUnits, type SellablePosition } from '../lib/saleRules';

interface TransactionFormProps {
  onSuccess?: () => void;
  /** What the person holds today: the only things that can be sold. */
  positions?: SellablePosition[];
  /** The person's own currency: the icon of the dialog, and the currency every amount is recorded in. */
  currency?: string;
  /** The cash held in `currency`. A purchase can be paid with it only while there is some; left out, none is assumed. */
  cashAvailable?: number;
  /** Correct this transaction instead of logging a new one: what was traded and its kind stay, the rest can change. */
  editing?: EditableTransaction;
  /** The server no longer has the transaction being corrected: whoever lists it should reload. */
  onStale?: () => void;
}

interface SearchItem {
  symbol: string;
  name: string;
  assetClass: string;
  sector: string;
}

export default function TransactionForm({ onSuccess, positions = [], currency: currencyProp = 'EUR', cashAvailable = 0, editing, onStale }: TransactionFormProps) {
  const words = useTranslation();
  const fieldId = useId();
  const { t } = words;
  const isEditing = editing !== undefined;
  const currency = editing?.currency ?? currencyProp;
  const [type, setType] = useState<'BOUGHT' | 'SOLD' | 'DEPOSIT' | 'WITHDRAWAL'>(editing?.type ?? 'BOUGHT');
  const [symbol, setSymbol] = useState(editing?.symbol ?? '');
  const [name, setName] = useState(editing?.name ?? '');
  const [quantity, setQuantity] = useState(editing ? String(editing.quantity ?? 1) : '1');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [fee, setFee] = useState(editing ? String(editing.fee) : '0');
  /** A purchase can use the cash already held instead of bringing new money. Off unless asked for. */
  const [paidWithCash, setPaidWithCash] = useState(editing?.paidWithCash ?? false);
  const [date, setDate] = useState(() => (editing ? editing.date.slice(0, 10) : new Date().toISOString().split('T')[0]));
  const [assetClass, setAssetClass] = useState('Stock');
  const [sector, setSector] = useState('Technology');
  const [region, setRegion] = useState('Europe');

  // Autocomplete state
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  // A transaction being corrected already has its instrument: nothing is searched.
  const [isCompleted, setIsCompleted] = useState(isEditing);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const { run, pending: isSubmitting } = useSubmitOnce();
  const [sellingHolding, setSellingHolding] = useState<SellablePosition | null>(null);
  const isSale = type === 'SOLD';
  /** Crypto is a class of asset, not an industry: it has no sector to pick. */
  const hasSector = assetClass !== 'Crypto';
  const sectorToSend = !hasSector ? undefined : isSale ? sector || undefined : sector || SECTORS[0];
  const saleCheck = isSale && sellingHolding ? checkSaleQuantity(quantity, sellingHolding.quantity, t) : null;
  const cannotConfirm = !isEditing && isSale && (!sellingHolding || !saleCheck?.ok);

  // Only what differs from the transaction as it was is sent; with nothing different there is nothing to save.
  const correction = editing ? correctionOf(editing, { quantity, amount, fee, date, paidWithCash }) : null;
  const hasChanges = correction !== null && Object.keys(correction).length > 0;
  /** Paying with cash is offered while there is cash to pay with; a purchase already paid that way can always be switched back. */
  const offersCash = type === 'BOUGHT' && (cashAvailable > 0.005 || paidWithCash);

  const chooseTransactionType = (next: typeof type) => {
    setType(next);
    // A sale starts from what is owned; a purchase from a search. Nothing carries over between them.
    setSymbol('');
    setName('');
    setIsCompleted(false);
    setSellingHolding(null);
    setPaidWithCash(false);
    setQuantity(next === 'SOLD' ? '' : '1');
  };

  const selectHolding = (holding: SellablePosition) => {
    setSellingHolding(holding);
    setSymbol(holding.symbol);
    setName(holding.name);
    setAssetClass(normalizeAssetClass(holding.assetClass));
    setSector(sectorOf(holding.sector));
    setRegion(holding.region);
    setQuantity('');
  };

  // Trigger market autocomplete search when user types 3+ characters
  useEffect(() => {
    if (isCompleted || symbol.trim().length < 3) {
      setSearchResults([]);
      setShowDropdown(false);
      setHighlightedIndex(-1);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/market/search?q=${encodeURIComponent(symbol)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
          setShowDropdown(data.length > 0 && !isCompleted);
          setHighlightedIndex(data.length > 0 ? 0 : -1);
        }
      } catch (err) {
        console.error('Failed to search market tickers:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [symbol, isCompleted]);

  const handleSelectSearchResult = (item: SearchItem) => {
    setSymbol(item.symbol);
    setName(item.name);
    if (item.assetClass) setAssetClass(normalizeAssetClass(item.assetClass));
    // Crypto is a class of asset, not an industry: a result that names it as its sector leaves the sector empty.
    if (item.sector) setSector(sectorOf(item.sector));
    setIsCompleted(true);
    setShowDropdown(false);
    setSearchResults([]);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || searchResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1));
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
        e.preventDefault();
        handleSelectSearchResult(searchResults[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      // Escape closes the list first; the dialog only closes on the next press.
      e.preventDefault();
      setShowDropdown(false);
    }
  };

  const submitCorrection = async () => {
    if (!editing || !hasChanges) return;
    await run(async () => {
      try {
        const response = await authorizedFetch(`/api/transactions/${encodeURIComponent(editing.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(correction),
        });
        if (response.ok) {
          onSuccess?.();
          return;
        }
        const data = await response.json().catch(() => ({}));
        if (response.status === 404) {
          setStatus({ type: 'error', message: t('history.gone') });
          onStale?.();
          return;
        }
        setStatus({ type: 'error', message: knownServerMessage(data, t, words.locale) ?? serverMessage(data, words, 'history.changeFailed') });
      } catch {
        setStatus({ type: 'error', message: t('history.changeNetwork') });
      }
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus(null);
    if (isEditing) return submitCorrection();

    const isCashOp = type === 'DEPOSIT' || type === 'WITHDRAWAL';
    if (isSale && cannotConfirm) return;
    if (!isCashOp && (!symbol || !amount)) {
      setStatus({ type: 'error', message: t('tx.errSymbolAmount') });
      return;
    }

    if (isCashOp && !amount) {
      setStatus({ type: 'error', message: t('tx.errCash') });
      return;
    }

    await run(async () => {
      try {
        const response = await authorizedFetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type,
            symbol: isCashOp ? 'CASH' : symbol.toUpperCase(),
            name: name || (isCashOp ? 'Cash Operation' : symbol.toUpperCase()),
            quantity: isCashOp ? 1.0 : parseFloat(quantity || '1'),
            amount: parseFloat(amount),
            fee: parseFloat(fee || '0'),
            date: date ? new Date(date).toISOString() : new Date().toISOString(),
            assetClass: isCashOp ? 'Cash' : assetClass,
            sector: isCashOp ? 'Financials' : sectorToSend,
            region: isCashOp ? 'Global' : region,
            currency,
            paidWithCash: type === 'BOUGHT' && paidWithCash,
          }),
        });

        const data = await response.json().catch(() => ({}) as { error?: string });

        if (response.ok) {
          setStatus({
            type: 'success',
            message: t('tx.recorded'),
          });
          setSymbol('');
          setName('');
          setQuantity(isSale ? '' : '1');
          setSellingHolding(null);
          setAmount('');
          setFee('0');
          setPaidWithCash(false);
          if (onSuccess) {
            onSuccess();
          }
        } else {
          // Our own sentence for a cash purchase that cannot be paid with cash: it says what to do instead, in any language.
          const notEnoughCash = (data as { code?: unknown }).code === 'INSUFFICIENT_CASH' ? knownServerMessage(data, t, words.locale) : null;
          setStatus({ type: 'error', message: notEnoughCash ?? serverMessage(data, words, 'tx.notRecorded') });
        }
      } catch {
        setStatus({ type: 'error', message: t('tx.notRecordedNetwork') });
      }
    });
  };

  const isCashOp = type === 'DEPOSIT' || type === 'WITHDRAWAL';

  return (
    <div style={{ fontFamily: 'inherit' }}>
      <h2
        style={{
          fontSize: '22px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          letterSpacing: '-0.5px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            backgroundColor: 'rgba(37, 99, 235, 0.15)',
            color: 'var(--accent-primary)',
          }}
        >
          <CurrencyIcon currency={currency} size={20} />
        </div>
        {isEditing ? t('tx.editTitle') : t('header.logTransaction')}
      </h2>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {isEditing && editing && (
          <>
            <p className="tx-locked-line">
              <span className={`tx-locked-line__kind${type === 'SOLD' ? ' tx-locked-line__kind--sold' : isCashOp ? ' tx-locked-line__kind--cash' : ''}`}>
                {t(type === 'BOUGHT' ? 'tx.type.bought' : type === 'SOLD' ? 'tx.type.sold' : type === 'DEPOSIT' ? 'tx.type.deposit' : 'tx.type.withdraw')}
              </span>
              {!isCashOp && (
                <>
                  <span className="tx-locked-line__name">{editing.name || editing.symbol}</span>
                  <span className="tx-locked-line__symbol">{editing.symbol}</span>
                </>
              )}
            </p>
            <p className="tx-locked-hint">{t('tx.lockedHint')}</p>
          </>
        )}

        {/* Transaction Type Selector */}
        {!isEditing && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-canvas)',
            border: '1px solid var(--border-card-color)',
            padding: '4px',
            gap: '4px',
          }}
        >
          <button
            type="button"
            onClick={() => chooseTransactionType('BOUGHT')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '9px 4px',
              minHeight: 'var(--touch-target)',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 'var(--text-xs)',
              backgroundColor: type === 'BOUGHT' ? 'var(--color-profit)' : 'transparent',
              color: type === 'BOUGHT' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            <ArrowUpRight size={14} /> {t('tx.type.bought')}
          </button>

          <button
            type="button"
            onClick={() => chooseTransactionType('SOLD')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '9px 4px',
              minHeight: 'var(--touch-target)',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 'var(--text-xs)',
              backgroundColor: type === 'SOLD' ? 'var(--color-loss)' : 'transparent',
              color: type === 'SOLD' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            <ArrowDownLeft size={14} /> {t('tx.type.sold')}
          </button>

          <button
            type="button"
            onClick={() => chooseTransactionType('DEPOSIT')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '9px 4px',
              minHeight: 'var(--touch-target)',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 'var(--text-xs)',
              backgroundColor: type === 'DEPOSIT' ? 'var(--color-deposit)' : 'transparent',
              color: type === 'DEPOSIT' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            <PlusCircle size={14} /> {t('tx.type.deposit')}
          </button>

          <button
            type="button"
            onClick={() => chooseTransactionType('WITHDRAWAL')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '9px 4px',
              minHeight: 'var(--touch-target)',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 'var(--text-xs)',
              backgroundColor: type === 'WITHDRAWAL' ? 'var(--color-warning)' : 'transparent',
              color: type === 'WITHDRAWAL' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            <MinusCircle size={14} /> {t('tx.type.withdraw')}
          </button>
        </div>
        )}

        {/* Dynamic Fields */}
        {!isCashOp ? (
          <>
            {isEditing ? null : isSale ? (
              <OwnedHoldingPicker positions={positions} selected={sellingHolding} onSelect={selectHolding} inputStyle={inputStyle} />
            ) : (
              <>
            <div style={{ position: 'relative' }} ref={searchContainerRef}>
              <label htmlFor={`${fieldId}-symbol`} style={{ ...labelStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Search size={14} aria-hidden="true" /> {t('tx.instrument')}</span>
                {isSearching && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-accent)' }}>{t('tx.searching')}</span>}
              </label>
              <input
                id={`${fieldId}-symbol`}
                type="text"
                placeholder={t('tx.tickerPlaceholder')}
                value={symbol}
                onChange={(e) => {
                  setSymbol(e.target.value);
                  setIsCompleted(false);
                }}
                onKeyDown={handleKeyDown}
                required
                style={inputStyle}
              />

              {/* Autocomplete Dropdown List */}
              {showDropdown && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    marginTop: '4px',
                    backgroundColor: 'var(--bg-popover)',
                    border: '1px solid var(--border-subtle-color)',
                    borderRadius: '8px',
                    maxHeight: '180px',
                    overflowY: 'auto',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                  }}
                >
                  {searchResults.map((item, idx) => (
                    <div
                      key={item.symbol}
                      onClick={() => handleSelectSearchResult(item)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      style={{
                        padding: '10px 12px',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border-subtle-color)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '13px',
                        backgroundColor: idx === highlightedIndex ? 'var(--accent-primary)' : 'transparent',
                        color: idx === highlightedIndex ? 'var(--text-primary)' : 'inherit',
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 700, color: 'var(--text-heading)' }}>{item.symbol}</span>
                        <span style={{ color: 'var(--text-secondary)', marginLeft: '8px', fontSize: 'var(--text-xs)' }}>{item.name}</span>
                      </div>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-profit)', backgroundColor: 'var(--color-profit-bg)', padding: '2px 6px', borderRadius: '4px' }}>
                        {dataLabel(t, 'assetClass', item.assetClass)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

              </>
            )}

            {/* Quantity Field (Decimal / Float) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label htmlFor={`${fieldId}-qty`} style={labelStyle}>
                  {t('tx.quantity')}
                </label>
                <input id={`${fieldId}-qty`}
                  type="number"
                  step="any"
                  placeholder={t('tx.quantityPlaceholder')}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                  aria-invalid={saleCheck ? !saleCheck.ok && quantity !== '' : undefined}
                  style={inputStyle}
                />
                {isSale && sellingHolding && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '6px', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    <span>{t('tx.available', { units: formatUnits(sellingHolding.quantity) })}</span>
                    <button
                      type="button"
                      className="tx-max"
                      onClick={() => setQuantity(formatUnits(sellingHolding.quantity))}
                    >
                      {t('tx.max')}
                    </button>
                  </div>
                )}
                {saleCheck && !saleCheck.ok && quantity !== '' && (
                  <p role="alert" style={{ margin: '6px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-loss)' }}>
                    {saleCheck.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor={`${fieldId}-amount`} style={labelStyle}>
                  {type === 'BOUGHT' ? t('tx.totalInvested') : t('tx.totalReceived')}
                </label>
                <MoneyInput
                  id={`${fieldId}-amount`}
                  currency={currency}
                  placeholder={t('tx.amountPlaceholder')}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
            </div>

            {isEditing ? null : isSale ? (
              // What is being sold is already decided by the pick: the three facts about it are shown, never asked again.
              sellingHolding && (
                <dl className="tx-locked" aria-label={t('tx.aboutHolding')}>
                  <div>
                    <dt>{t('tx.assetClass')}</dt>
                    <dd>{dataLabel(t, 'assetClass', assetClass)}</dd>
                  </div>
                  {sector && (
                    <div>
                      <dt>{t('tx.sector')}</dt>
                      <dd>{dataLabel(t, 'sector', sector)}</dd>
                    </div>
                  )}
                  <div>
                    <dt>{t('tx.region')}</dt>
                    <dd>{dataLabel(t, 'region', region)}</dd>
                  </div>
                </dl>
              )
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: hasSector ? '1fr 1fr' : '1fr', gap: '12px' }}>
                  <div>
                    <label htmlFor={`${fieldId}-class`} style={labelStyle}>
                      {t('tx.assetClass')}
                    </label>
                    <select id={`${fieldId}-class`} value={assetClass} onChange={(e) => setAssetClass(e.target.value)} style={inputStyle}>
                      {ASSET_CLASSES.map((option) => (
                        <option key={option} value={option}>
                          {dataLabel(t, 'assetClass', option)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {hasSector && (
                    <div>
                      <label htmlFor={`${fieldId}-sector`} style={labelStyle}>
                        {t('tx.sector')}
                      </label>
                      <select id={`${fieldId}-sector`} value={sector || SECTORS[0]} onChange={(e) => setSector(e.target.value)} style={inputStyle}>
                        {SECTORS.map((option) => (
                          <option key={option} value={option}>
                            {dataLabel(t, 'sector', option)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor={`${fieldId}-region`} style={labelStyle}>
                    {t('tx.region')}
                  </label>
                  <select id={`${fieldId}-region`} value={region} onChange={(e) => setRegion(e.target.value)} style={inputStyle}>
                    {REGIONS.map((option) => (
                      <option key={option} value={option}>
                        {dataLabel(t, 'region', option)}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </>
        ) : (
          <div>
            <label htmlFor={`${fieldId}-cash`} style={labelStyle}>
              {t('tx.cashAmount')}
            </label>
            <MoneyInput
              id={`${fieldId}-cash`}
              currency={currency}
              placeholder={t('tx.cashPlaceholder')}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
        )}

        {/* Date Field Moved Above Broker Fee */}
        <div>
          <label htmlFor={`${fieldId}-date`} style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calendar size={14} aria-hidden="true" /> {t('tx.date')}
          </label>
          <input
            id={`${fieldId}-date`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            style={inputStyle}
          />
        </div>

        {/* A purchase brings new money unless it is paid with cash already held */}
        {offersCash && (
          <label className="tx-check">
            <input type="checkbox" checked={paidWithCash} onChange={(e) => setPaidWithCash(e.target.checked)} />
            <span>
              <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{t('tx.payWithCash')}</span>
              <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{t('tx.payWithCashHint')}</span>
              {cashAvailable > 0.005 && (
                <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  {t('tx.cashAvailable', { amount: formatMinor(Math.round(cashAvailable * 10 ** currencyExponent(currency)), currency, intlLocale(words.locale)) })}
                </span>
              )}
            </span>
          </label>
        )}

        {/* Broker Fee Field */}
        <div>
          <label htmlFor={`${fieldId}-fee`} style={labelStyle}>
            {t('tx.fee')}
          </label>
          <MoneyInput id={`${fieldId}-fee`} currency={currency} placeholder={t('tx.feePlaceholder')} value={fee} onChange={(e) => setFee(e.target.value)} />
        </div>

        {status && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500,
              backgroundColor: status.type === 'success' ? 'var(--color-profit-bg)' : 'var(--color-loss-bg)',
              color: status.type === 'success' ? 'var(--color-profit)' : 'var(--color-loss)',
              border: status.type === 'success' ? '1px solid var(--color-profit-glow)' : '1px solid var(--color-loss-glow)',
            }}
          >
            {status.message}
          </div>
        )}

        {/* Primary Blue Confirm Button */}
        <button
          type="submit"
          disabled={isSubmitting || cannotConfirm || (isEditing && !hasChanges)}
          aria-busy={isSubmitting}
          style={{
            marginTop: '8px',
            padding: '12px',
            minHeight: 'var(--touch-target)',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: 'var(--accent-primary)',
            color: 'var(--text-primary)',
            fontWeight: 700,
            fontSize: '14px',
            cursor: isSubmitting || cannotConfirm || (isEditing && !hasChanges) ? 'not-allowed' : 'pointer',
            opacity: isSubmitting || cannotConfirm || (isEditing && !hasChanges) ? 0.5 : 1,
            boxShadow: '0 4px 14px var(--accent-blue-glow)',
          }}
        >
          {isEditing ? (isSubmitting ? t('tx.saving') : t('tx.saveChanges')) : isSubmitting ? t('tx.confirming') : t('tx.confirm')}
        </button>
      </form>
    </div>
  );
}

const SECTORS = ['Technology', 'Financials', 'Healthcare', 'Energy', 'Industrials', 'Consumer'];
const REGIONS = ['Spain', 'Europe', 'North America', 'Asia-Pacific', 'LatAm', 'Global'];

const labelStyle = {
  display: 'block',
  fontSize: 'var(--text-xs)',
  fontWeight: 500,
  marginBottom: '6px',
  color: 'var(--text-secondary)',
} as const;

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border-card-color)',
  backgroundColor: 'var(--bg-input)',
  color: 'var(--text-primary)',
  fontSize: '14px',
  outline: 'none',
  minHeight: 'var(--touch-target)',
};