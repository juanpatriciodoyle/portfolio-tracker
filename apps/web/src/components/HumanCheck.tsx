import HCaptcha from '@hcaptcha/react-hcaptcha';
import { useEffect, useRef, useState } from 'react';
import type { HumanCheckWidgetProps } from '../hooks/useHumanCheck';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useTranslation } from '../i18n/useTranslation';

/** Under this width the full checkbox (303px) does not fit the sign-in card, so the compact one is drawn. */
const COMPACT_QUERY = '(max-width: 419px)';

const WIDGET_LANGUAGE = { en: 'en', 'es-AR': 'es' } as const;

/**
 * The checkbox of the human check, on the dark theme. The vendor lives only in this file: everything else talks to
 * `useHumanCheck`. If the widget cannot load, a calm sentence and a button to try again take its place.
 */
export default function HumanCheck({ siteKey, onToken, onExpire, resetCount }: HumanCheckWidgetProps) {
  const { t, locale } = useTranslation();
  const compact = useMediaQuery(COMPACT_QUERY);
  const widget = useRef<HCaptcha>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // The answer was used (or the attempt ended): the box must be empty again. Not on first render.
  const lastReset = useRef(resetCount);
  useEffect(() => {
    if (lastReset.current === resetCount) return;
    lastReset.current = resetCount;
    widget.current?.resetCaptcha();
  }, [resetCount]);

  if (failed) {
    return (
      <div className="human-check human-check--failed" role="alert">
        <p>{t('login.captchaLoadFailed')}</p>
        <button
          type="button"
          className="human-check__retry"
          onClick={() => {
            setFailed(false);
            setAttempt((count) => count + 1);
          }}
        >
          {t('login.captchaRetry')}
        </button>
      </div>
    );
  }

  return (
    <div className="human-check">
      <HCaptcha
        key={attempt}
        ref={widget}
        sitekey={siteKey}
        theme="dark"
        size={compact ? 'compact' : 'normal'}
        languageOverride={WIDGET_LANGUAGE[locale]}
        sentry={false}
        onVerify={onToken}
        onExpire={onExpire}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
