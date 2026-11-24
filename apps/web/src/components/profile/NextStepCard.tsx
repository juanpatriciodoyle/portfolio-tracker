import { X } from 'lucide-react';
import { useTranslation } from '../../i18n/useTranslation';
import { formatMinor } from '../../lib/money';

interface NextStepCardProps {
  /** What the home lived in today costs each month, in its currency; null when no cost is known yet. */
  monthlyCostsMinor: number | null;
  currency: string;
  /** Opens Log Transaction; the card offers no button where there is nothing to open. */
  onLogTransaction?: () => void;
  onDismiss: () => void;
}

/** What to do right after the first home is saved: the portfolio is what turns these figures into something the person can act on. */
export default function NextStepCard({ monthlyCostsMinor, currency, onLogTransaction, onDismiss }: NextStepCardProps) {
  const { t } = useTranslation();
  return (
    <section className="profile-card next-step" aria-labelledby="next-step-title">
      <div className="next-step__text">
        <h2 className="next-step__title" id="next-step-title">
          {t('nextStep.title')}
        </h2>
        <p className="next-step__body">
          {monthlyCostsMinor !== null && monthlyCostsMinor > 0
            ? t('nextStep.costs', { amount: formatMinor(monthlyCostsMinor, currency) })
            : t('nextStep.noCosts')}
        </p>
      </div>
      <div className="next-step__actions">
        {onLogTransaction && (
          <button type="button" className="btn-primary-apply" onClick={onLogTransaction}>
            {t('header.logTransaction')}
          </button>
        )}
        <button type="button" className="profile-icon-button" aria-label={t('nextStep.dismiss')} onClick={onDismiss}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
