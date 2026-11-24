import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from '../../i18n/useTranslation';
import type { ColumnKey } from '../../lib/holdingsColumns';
import type { HoldingRow } from '../../lib/holdingsRows';
import { formatFixed } from '../../lib/money';
import { COLUMN_LABEL } from './columns';
import { holdingFigure } from './figures';
import { SecurityLogo } from './SecurityLogo';

/** What a tap on a card adds to the four things it always shows. */
const DETAILS: readonly ColumnKey[] = ['units', 'held', 'paid', 'paidPerShare', 'pricePerShare', 'yearlyReturn'];

const toneClass = (tone?: 'profit' | 'loss') => (tone === 'profit' ? 'is-profit' : tone === 'loss' ? 'is-loss' : '');

function HoldingCard({ row, currency }: { row: HoldingRow; currency: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const value = holdingFigure('value', row, currency, t);
  const profit = holdingFigure('profit', row, currency, t);
  const details = DETAILS.map((key) => ({ key, figure: holdingFigure(key, row, currency, t) })).filter(({ figure }) => figure.text !== '');

  return (
    <li className={`holding-card ${row.isOpen ? '' : 'holding-card--sold'}`}>
      <button type="button" className="holding-card__summary" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen(!open)}>
        <SecurityLogo name={row.name} symbol={row.symbol} assetClass={row.assetClass} />
        <span className="holding-card__who">
          <span className="holding-card__name">
            {row.name}
            {!row.isOpen && <span className="holding-badge-sold">{t('holdings.sold')}</span>}
          </span>
          {row.isOpen && <span className="holding-card__symbol">{row.symbol}</span>}
        </span>
        <span className="holding-card__money">
          <span className="holding-card__value">{value.text}</span>
          <span className={`holding-card__profit ${toneClass(profit.tone)}`}>
            {profit.text} · {profit.sub}
          </span>
        </span>
        <ChevronDown size={16} className="holding-card__chevron" aria-hidden="true" />
        {row.isOpen && (
          <span className="holding-card__share">
            <span
              className="holding-card__bar"
              role="img"
              aria-label={`${t('holdings.col.share')}: ${formatFixed(row.share, 1)}%`}
            >
              <span className="holding-card__bar-fill" style={{ width: `${Math.min(100, Math.max(0, row.share))}%` }} />
            </span>
            <span className="holding-card__share-text" aria-hidden="true">
              {formatFixed(row.share, 1)}%
            </span>
          </span>
        )}
      </button>
      {open && (
        <dl id={detailsId} className="holding-card__details">
          {details.map(({ key, figure }) => (
            <div key={key}>
              <dt>{t(COLUMN_LABEL[key])}</dt>
              <dd className={toneClass(figure.tone)}>{figure.text}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

/** The holdings on a narrow screen: one card each, with value and profit showing and the rest one tap away. */
export function HoldingsCards({ rows, currency }: { rows: readonly HoldingRow[]; currency: string }) {
  const { t } = useTranslation();
  return (
    <ul className="holding-cards" aria-label={t('holdings.cards')}>
      {rows.map((row) => (
        <HoldingCard key={row.id} row={row} currency={currency} />
      ))}
    </ul>
  );
}

export default HoldingsCards;
