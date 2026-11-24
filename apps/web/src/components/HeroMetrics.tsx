import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatPercent, type ReportingPeriod } from '../data/sampleChartData';
import { useCountUp } from '../hooks/useCountUp';
import { HelpTip } from './HelpTip';
import { dataLabel } from '../i18n/dataLabels';
import { useTranslation } from '../i18n/useTranslation';
import { heroSummary, type GainPart, type HeroFigures } from '../lib/heroSummary';
import type { InflationLine } from '../lib/inflationLine';
import { formatMoney, formatUpTo, splitCents } from '../lib/money';

export type { HeroFigures };

interface HeroMetricsProps {
  figures: HeroFigures;
  period: ReportingPeriod;
  periodGain: number;
  periodPercent: number;
  currency: string;
  isRealInflationMode: boolean;
  country: string;
  /** True until the first answer from the server: the hero holds its place instead of showing zeros as results. */
  loading?: boolean;
  /** The figures were already known when the screen opened (kept from the last visit): they appear in place, with no count-up. */
  settled?: boolean;
  /** What drove the profit, in a sentence or two (null when there is nothing worth saying): it sits under the profit. */
  story?: string | null;
  /** The whole-history return before and after inflation (null: not shown); `inflationRate` is the yearly rise it rests on. */
  inflation?: InflationLine | null;
  inflationRate?: number;
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
  const format = (value: number) => formatMoney(value, currency, { signed });
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
  const money = (amount: number) => formatMoney(amount, currency, { signed: true });

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
  currency,
  isRealInflationMode,
  country,
  loading = false,
  settled = false,
  story = null,
  inflation = null,
  inflationRate,
}) => {
  const { t } = useTranslation();
  const summary = heroSummary({ figures, period, periodGain, periodPercent, isRealInflationMode }, t);
  const money = (amount: number) => formatMoney(amount, currency);
  const { totalValue, gain } = summary;
  const percentShown = useCountUp(gain.percent ?? 0, { settled });

  const body = () => {
    if (loading) return <HeroSkeleton />;
    return (
      <>
        <div className="hero__figures">
          <div className="hero__figure hero__enter" style={stagger(0)}>
            <p className="hero__label">{totalValue.title}</p>
            <p className="hero__amount">
              <Money amount={totalValue.amount} currency={currency} quietCents settled={settled} />
            </p>
            <p className="hero__meta" title={totalValue.beforeInflation === null ? undefined : t('hero.adjustedFor', { country: dataLabel(t, 'country', country) })}>
              {totalValue.beforeInflation === null
                ? t('hero.moneyPutIn', { amount: money(summary.moneyPutIn) })
                : t('hero.beforeInflation', { amount: money(totalValue.beforeInflation) })}
              {totalValue.beforeInflation === null && <HelpTip term={t('hero.moneyPutIn.term')} text={t('help.moneyPutIn')} />}
            </p>
            {totalValue.beforeInflation === null ? (
              <dl className="hero__split">
                <div>
                  <dt>{t('hero.invested')}</dt>
                  <dd>{money(summary.holdingsValue)}</dd>
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
            <div className="hero__meta-group">
              <p className="hero__meta">
                {gain.percent !== null && (
                  <>
                    <span className="hero__percent">{withSign(gain.percent, formatPercent(percentShown, false))}</span>{' '}
                  </>
                )}
                {gain.phrase}
              </p>
              {inflation && (
                <p
                  className="hero__meta hero__meta--quiet"
                  title={t('hero.inflationNote', { country: dataLabel(t, 'country', country), rate: formatUpTo(inflationRate ?? 0, 1) })}
                >
                  {isRealInflationMode
                    ? t('hero.inflation.on', { before: withSign(inflation.before, formatPercent(inflation.before, false)) })
                    : t('hero.inflation.both', {
                        before: withSign(inflation.before, formatPercent(inflation.before, false)),
                        after: withSign(inflation.after, formatPercent(inflation.after, false)),
                      })}
                </p>
              )}
            </div>
            {story ? <p className="hero__story">{story}</p> : <span />}
          </div>
        </div>

        {!summary.pricesAvailable && (
          <div className="hero__context hero__enter" style={stagger(2)}>
            <p className="hero__note hero__note--warning">{t('hero.pricesUnavailable')}</p>
          </div>
        )}

        {summary.gainParts && <GainBreakdown parts={summary.gainParts} total={gain.amount} currency={currency} />}
      </>
    );
  };

  return (
    <section className="hero" aria-label={t('hero.section')} aria-busy={loading}>
      {body()}
    </section>
  );
};

export default HeroMetrics;
