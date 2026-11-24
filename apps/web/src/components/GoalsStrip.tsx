import type { CSSProperties } from 'react';
import { intlLocale } from '../i18n/locale';
import { useTranslation } from '../i18n/useTranslation';
import type { HomeGoals } from '../hooks/useHomeGoals';
import { goalsStrip } from '../lib/goalsStrip';

interface GoalsStripProps {
  goals: HomeGoals;
  onOpenProfile: () => void;
}

/** Arrives with the hero's last step: the stylesheet turns the step into a delay. */
const ARRIVAL: CSSProperties = { ['--i' as string]: 5 };

/**
 * Under the hero: what the person keeps each month and what the portfolio could pay, each in a sentence. With no home or income to speak from it is one quiet prompt toward the profile.
 */
export default function GoalsStrip({ goals, onOpenProfile }: GoalsStripProps) {
  const { t, locale } = useTranslation();
  if (!goals.ready) return null;
  const view = goalsStrip(goals, t, intlLocale(locale));

  if (view.kind === 'prompt') {
    return (
      <section className="goals-strip goals-strip--prompt hero__enter" style={ARRIVAL} aria-label={t('goals.section')}>
        <p className="goals-strip__text">{t('goals.prompt')}</p>
        <button type="button" className="goals-strip__link" onClick={onOpenProfile}>
          {t('goals.promptAction')}
        </button>
      </section>
    );
  }

  return (
    <section className="goals-strip hero__enter" style={ARRIVAL} aria-label={t('goals.section')}>
      <div className="goals-strip__lines">
        {view.lines.map((line) => (
          <div key={line.key} className="goals-strip__line">
            <p className="goals-strip__label">{line.label}</p>
            <p className="goals-strip__text">{line.text}</p>
          </div>
        ))}
      </div>
      <button type="button" className="goals-strip__link" onClick={onOpenProfile}>
        {t('goals.more')}
      </button>
    </section>
  );
}
