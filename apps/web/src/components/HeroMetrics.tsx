import React, { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatCurrency, formatPercent, type ReportingPeriod } from '../data/sampleChartData';
import { useCountUp } from '../hooks/useCountUp';
import { dataLabel } from '../i18n/dataLabels';
import { useTranslation } from '../i18n/useTranslation';
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
  /** The figures were already known when the screen opened (kept from the last visit): they appear in place, with no count-up. */
  settled?: boolean;
  /** The period picker: it sits under the figures it changes. */
  children?: ReactNode;
}

/** Which step of the arrival an element takes: the stylesheet turns the step into a delay. */
const stagger = (step: number) => ({ '--i': step }) as React.CSSProperties;

const toneClass = (amount: number) => (amount >= 0 ? 'is-positive' : 'is-negative');
const withSign = (amount: number, text: string) => (amount > 0 ? `+${text}` : text);

interface MoneyProps {
  amount: number;
  currency: string;
  signed?: boolean;
  /** Draw the cents smaller and quieter: the whole amount is what the eye should read. */
  quietCents?: boolean;
  settled?: boolean;
}

/** An amount that settles into place. Assistive technology reads the final figure, never the ones on the way. */
function Money({ amount, currency, signed = false, quietCents = false, settled = false }: MoneyProps) {
  const shown = useCountUp(amount, { settled });
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
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const money = (amount: number) => withSign(amount, formatCurrency(amount, currency));

  return (
    <div className="hero__explain hero__enter" style={stagger(3)}>
      <button type="button" className="hero__toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        {t('hero.howItAddsUp')}
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
              <span className="hero__part-name">{t('hero.totalProfit')}</span>
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
      {[0, 1].map((block) => (
        <div key={block} className="hero__skeleton-block">
          <span className="hero__skeleton-line hero__skeleton-line--label" />
          <span className="hero__skeleton-line hero__skeleton-line--amount" />
          <span className="hero__skeleton-line hero__skeleton-line--gain" />
        </div>
      ))}
    </div>
  );
}

/**
 * The home screen's answer to "how am I doing?": what everything is worth, and what it has earned, side by side.
 * Each figure carries its two parts on one quiet line and one fold-out that adds the profit up.
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
  settled = false,
  children,
}) => {
  const { t } = useTranslation();
  const summary = heroSummary({ figures, period, periodGain, periodPercent, isRealInflationMode }, t);
  const money = (amount: number) => formatCurrency(amount, currency);
  const signedMoney = (amount: number) => withSign(amount, money(amount));
  const { totalValue, gain } = summary;
  const percentShown = useCountUp(gain.percent, { settled });

  const body = () => {
    if (loading) return <HeroSkeleton />;
    if (summary.isEmpty) {
      return (
        <div className="hero__empty hero__enter">
          <p className="hero__label">{t('hero.totalValue')}</p>
          <p className="hero__empty-title">{t('hero.empty.title')}</p>
          <p className="hero__note">{t('hero.empty.note')}</p>
        </div>
      );
    }
    return (
      <>
        <div className="hero__figures">
          <div className="hero__figure hero__enter" style={stagger(0)}>
            <p className="hero__label">{totalValue.title}</p>
            <p className="hero__amount">
              <Money amount={totalValue.amount} currency={currency} quietCents settled={settled} />
            </p>
            <p className="hero__meta" title={totalValue.beforeInflation === null ? undefined : t('hero.adjustedFor', { country: dataLabel(t, 'country', country) })}>
              {totalValue.beforeInflation === null ? t('hero.whatYouOwn') : t('hero.beforeInflation', { amount: money(totalValue.beforeInflation) })}
            </p>
            {totalValue.beforeInflation === null ? (
              <dl className="hero__split">
                <div>
                  <dt>{t('hero.invested')}</dt>
                  <dd>{money(summary.invested)}</dd>
                </div>
                <div>
                  <dt>{t('hero.cash')}</dt>
                  <dd>{money(summary.cash)}</dd>
                </div>
              </dl>
            ) : (
              <span />
            )}
          </div>

          <div className={`hero__figure hero__figure--profit hero__enter ${toneClass(gain.amount)}`} style={stagger(1)}>
            <p className="hero__label">{gain.label}</p>
            <p className="hero__amount">
              <Money amount={gain.amount} currency={currency} signed quietCents settled={settled} />
            </p>
            <p className="hero__meta">
              <span className="hero__percent">{withSign(gain.percent, formatPercent(percentShown, false))}</span> {gain.phrase}
            </p>
            {summary.gainSplit ? (
              <dl className="hero__split">
                <div>
                  <dt>{t('hero.stillInvested')}</dt>
                  <dd className={toneClass(summary.gainSplit.stillInvested)}>{signedMoney(summary.gainSplit.stillInvested)}</dd>
                </div>
                <div>
                  <dt>{t('hero.alreadySold')}</dt>
                  <dd className={summary.gainSplit.sold === 0 ? undefined : toneClass(summary.gainSplit.sold)}>
                    {summary.gainSplit.sold === 0 ? t('hero.noneYet') : signedMoney(summary.gainSplit.sold)}
                  </dd>
                </div>
              </dl>
            ) : (
              <span />
            )}
          </div>
        </div>

        {(period !== 'All' || !summary.pricesAvailable) && (
          <div className="hero__context hero__enter" style={stagger(2)}>
            {period !== 'All' && <p className="hero__note">{periodWindow}</p>}
            {!summary.pricesAvailable && (
              <p className="hero__note hero__note--warning">{t('hero.pricesUnavailable')}</p>
            )}
          </div>
        )}

        {summary.gainParts && <GainBreakdown parts={summary.gainParts} total={gain.amount} currency={currency} />}
      </>
    );
  };

  return (
    <section className="hero" aria-label={t('hero.section')} aria-busy={loading}>
      {body()}
      {children && (
        <div className="hero__controls hero__enter" style={stagger(4)}>
          {children}
        </div>
      )}
    </section>
  );
};

export default HeroMetrics;
