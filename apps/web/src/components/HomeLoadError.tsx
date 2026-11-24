import { useId } from 'react';
import { useTranslation } from '../i18n/useTranslation';

interface HomeLoadErrorProps {
  onRetry: () => void;
}

/**
 * What home says when the server could not answer: calm, with the way out in reach. It is never mistaken for an
 * account with nothing in it, so nobody with money in the app is asked to "add a first purchase".
 */
export default function HomeLoadError({ onRetry }: HomeLoadErrorProps) {
  const { t } = useTranslation();
  const titleId = useId();

  return (
    <section className="home-error hero__enter" role="alert" aria-labelledby={titleId}>
      <h2 id={titleId} className="home-error__title">
        {t('homeError.title')}
      </h2>
      <p className="home-error__body">{t('homeError.body')}</p>
      <button type="button" className="btn-primary-apply home-error__retry" onClick={onRetry}>
        {t('homeError.retry')}
      </button>
    </section>
  );
}
