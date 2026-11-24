import HCaptcha from '@hcaptcha/react-hcaptcha';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { HumanCheckIncompleteError, type HumanCheckHandle } from '../lib/humanCheck';
import { useTranslation } from '../i18n/useTranslation';

const WIDGET_LANGUAGE = { en: 'en', 'es-AR': 'es' } as const;

/** The vendor's events that mean its script never arrived (anything else is the person closing a challenge). */
const LOAD_FAILURES: ReadonlySet<string> = new Set(['script-error', 'script-load-error-other']);

/**
 * The invisible human check, dark theme: nothing is drawn until `execute()` runs, and then a challenge appears only if
 * the vendor wants one. The vendor lives only in this file. If its script cannot load, a calm sentence and a button to
 * try again take its place.
 */
const HumanCheck = forwardRef<HumanCheckHandle, { siteKey: string }>(function HumanCheck({ siteKey }, ref) {
  const { t, locale } = useTranslation();
  const widget = useRef<HCaptcha>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useImperativeHandle(
    ref,
    () => ({
      execute: async () => {
        if (widget.current === null) throw new HumanCheckIncompleteError();
        try {
          const { response } = await widget.current.execute({ async: true });
          if (!response) throw new HumanCheckIncompleteError();
          return response;
        } catch {
          throw new HumanCheckIncompleteError();
        }
      },
      reset: () => widget.current?.resetCaptcha(),
    }),
    []
  );

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
    <HCaptcha
      key={attempt}
      ref={widget}
      sitekey={siteKey}
      theme="dark"
      size="invisible"
      languageOverride={WIDGET_LANGUAGE[locale]}
      sentry={false}
      onError={(event) => {
        if (LOAD_FAILURES.has(event)) setFailed(true);
      }}
    />
  );
});

export default HumanCheck;
