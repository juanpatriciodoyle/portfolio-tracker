import React, { useId, useState, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronDown } from 'lucide-react';
import { formatCurrency, type ReportingPeriod } from '../data/sampleChartData';
import { useCountUp } from '../hooks/useCountUp';
import { heroSummary, type GainPart, type HeroFigures } from '../lib/heroSummary';
import { splitCents } from '../lib/money';

export type { HeroFigures };

interface HeroMetricsProps {
  figures: HeroFigures;
  period: ReportingPeriod;
  periodGain: number;
  periodPercent: number;
  /** The dates the selected period covers, ready to read. */
  periodWindow: string;
  currency: string;
  isRealInflationMode: boolean;
  country: string;
  /** True until the first answer from the server: the hero holds its place instead of showing zeros as results. */
  loading?: boolean;
  /** The period picker: it sits under the figures it changes. */
  children?: ReactNode;
}

const toneClass = (amount: number) => (amount >= 0 ? 'is-positive' : 'is-negative');
const withSign = (amount: number, text: string) => (amount > 0 ? `+${text}` : text);

interface MoneyProps {
  amount: number;
  currency: string;
  signed?: boolean;
  /** Draw the cents smaller and quieter: the whole amount is what the eye should read. */
  quietCents?: boolean;
}

/** An amount that settles into place. Assistive technology reads the final figure, never the ones on the way. */
function Money({ amount, currency, signed = false, quietCents = false }: MoneyProps) {
  const shown = useCountUp(amount);
  const format = (value: number) => {
    const text = formatCurrency(value, currency);
    return signed ? withSign(value, text) : text;
  };
  const { whole, cents } = quietCents ? splitCents(format(shown)) : { whole: format(shown), cents: '' };

  return (
    <span role="img" aria-label={format(amount)}>
      {whole}
      {cents && <span className="hero__cents">{cents}</span>}
    </span>
  );
}

function GainBreakdown({ parts, total, currency }: { parts: GainPart[]; total: number; currency: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const money = (amount: number) => withSign(amount, formatCurrency(amount, currency));

  return (
    <div className="hero__explain hero__enter" style={{ '--i': 3 } as React.CSSProperties}>
      <button type="button" className="hero__toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        How this adds up
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <div id={panelId} className="hero__breakdown" data-open={open} inert={!open}>
        <div className="hero__breakdown-inner">
          <ul className="hero__parts">
            {parts.map((part) => (
              <li key={part.key} className="hero__part">
                <span className="hero__part-name">
                  {part.label}
                  <small>{part.meaning}</small>
                </span>
                <span className={`hero__part-amount ${toneClass(part.amount)}`}>{money(part.amount)}</span>
              </li>
            ))}
            <li className="hero__part hero__part--total">
              <span className="hero__part-name">Total gain</span>
              <span className={`hero__part-amount ${toneClass(total)}`}>{money(total)}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div className="hero__skeleton" aria-hidden="true">
      <span className="hero__skeleton-line hero__skeleton-line--label" />
      <span className="hero__skeleton-line hero__skeleton-line--amount" />
      <span className="hero__skeleton-line hero__skeleton-line--gain" />
    </div>
  );
}

/**
 * The home screen's answer to "how am I doing?": what everything is worth, then what it has earned.
 * One figure leads; the rest is one quiet line and one fold-out that adds the gain up.
 */
export const HeroMetrics: React.FC<HeroMetricsProps> = ({
  figures,
  period,
  periodGain,
  periodPercent,
  periodWindow,
  currency,
  isRealInflationMode,
  country,
  loading = false,
  children,
}) => {
  const summary = heroSummary({ figures, period, periodGain, periodPercent, isRealInflationMode });
  const money = (amount: number) => formatCurrency(amount, currency);
  const { totalValue, gain } = summary;
  const percentShown = useCountUp(gain.percent);
  const GainIcon = gain.amount >= 0 ? ArrowUpRight : ArrowDownRight;

  const body = () => {
    if (loading) return <HeroSkeleton />;
    if (summary.isEmpty) {
      return (
        <div className="hero__empty hero__enter">
          <p className="hero__label">Total value</p>
          <p className="hero__empty-title">Nothing here yet</p>
          <p className="hero__note">Log your first transaction and your total value appears here.</p>
        </div>
      );
    }
    return (
      <>
        <div className="hero__value">
          <p className="hero__label hero__enter" style={{ '--i': 0 } as React.CSSProperties}>
            {totalValue.title}
          </p>
          <p className="hero__amount hero__enter" style={{ '--i': 0 } as React.CSSProperties}>
            <Money amount={totalValue.amount} currency={currency} quietCents />
          </p>
        </div>

        <p className={`hero__gain hero__enter ${toneClass(gain.amount)}`} style={{ '--i': 1 } as React.CSSProperties}>
          <GainIcon size={20} aria-hidden="true" />
          <Money amount={gain.amount} currency={currency} signed />
          <span className="hero__gain-percent">({withSign(gain.percent, `${percentShown.toFixed(2)}%`)})</span>
          <span className="hero__gain-phrase">{gain.phrase}</span>
        </p>

        <div className="hero__context hero__enter" style={{ '--i': 2 } as React.CSSProperties}>
          {totalValue.beforeInflation === null ? (
            <dl className="hero__split">
              <div>
                <dt>Invested</dt>
                <dd>{money(summary.invested)}</dd>
              </div>
              <div>
                <dt>Cash</dt>
                <dd>{money(summary.cash)}</dd>
              </div>
            </dl>
          ) : (
            <p className="hero__note" title={`Adjusted for ${country} inflation`}>
              Before inflation: {money(totalValue.beforeInflation)}
            </p>
          )}
          {period !== 'All' && <p className="hero__note">{periodWindow}</p>}
          {!summary.pricesAvailable && (
            <p className="hero__note hero__note--warning">Live prices are unavailable, so what you hold is shown at what it cost.</p>
          )}
        </div>

        {summary.gainParts && <GainBreakdown parts={summary.gainParts} total={gain.amount} currency={currency} />}
      </>
    );
  };

  return (
    <section className="hero" aria-label="Your portfolio" aria-busy={loading}>
      {body()}
      {children && (
        <div className="hero__controls hero__enter" style={{ '--i': 4 } as React.CSSProperties}>
          {children}
        </div>
      )}
    </section>
  );
};

export default HeroMetrics;
