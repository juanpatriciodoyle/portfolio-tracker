import type { MouseEvent } from 'react';
import { useTranslation } from '../i18n/useTranslation';

/** The id the skip link jumps to: the page's one `<main>`. */
export const MAIN_CONTENT_ID = 'main-content';

/**
 * The first stop of the keyboard: invisible until it is reached, then one press to jump past the header to the page itself.
 * Pages here are routed by the URL hash, so the jump moves focus by script and never touches the address.
 */
export default function SkipLink() {
  const { t } = useTranslation();
  const jump = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const main = document.getElementById(MAIN_CONTENT_ID);
    main?.focus();
    main?.scrollIntoView?.({ block: 'start' });
  };
  return (
    <a className="skip-link" href={`#${MAIN_CONTENT_ID}`} onClick={jump}>
      {t('a11y.skipToContent')}
    </a>
  );
}
