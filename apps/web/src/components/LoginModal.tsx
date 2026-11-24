import { KeyRound, ShieldCheck } from 'lucide-react';
import { useAppConfig } from '../hooks/useAppConfig';
import { useSignIn } from '../hooks/useSignIn';
import { isGoogleSignInConfigured } from '../lib/googleConfig';
import { browserSupportsWebAuthn } from '../lib/passkeys';
import LanguageSelector from '../i18n/LanguageSelector';
import { useTranslation } from '../i18n/useTranslation';
import type { SignedInUserDto } from '../contracts';
import GoogleSignIn from './GoogleSignIn';

interface LoginModalProps {
  onSuccess: (user: SignedInUserDto) => void;
}

/**
 * The way in. Google is the front door: it creates the account and confirms who the person is. A passkey (Touch ID,
 * Face ID) is added afterwards, from the account, and signs in on its own, with no email to type. The demo is a private
 * copy for anyone who only wants to look.
 */
export default function LoginModal({ onSuccess }: LoginModalProps) {
  const { t } = useTranslation();
  const { pending: isLoading, error, notice, setError, withGoogleToken, withPasskey, asGuest } = useSignIn(onSuccess);
  const { demoEnabled } = useAppConfig();

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--bg-canvas)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
    >
      <div style={{ position: 'absolute', top: '16px', right: '16px' }}>
        <LanguageSelector />
      </div>
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          backgroundColor: 'var(--bg-card)',
          border: 'var(--border-card)',
          borderRadius: '16px',
          padding: '36px',
          boxShadow: 'var(--shadow-dialog)',
          textAlign: 'center',
        }}
      >
        <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-heading)' }}>
          Portfolio Tracker
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '0 0 28px 0' }}>
          {t('login.tagline')}
        </p>

        {notice && !error && (
          <div role="status" style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-input)', color: 'var(--text-heading)', border: '1px solid var(--border-subtle-color)', fontSize: '13px', marginBottom: '20px', textAlign: 'left' }}>
            {notice}
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: 'var(--color-loss-bg)',
              color: 'var(--text-heading)',
              border: '1px solid var(--color-loss-glow)',
              fontSize: '13px',
              marginBottom: '20px',
              textAlign: 'left',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Sign in with Google: only where the deployment has a Google client id */}
          {isGoogleSignInConfigured() && (
            <GoogleSignIn onToken={(accessToken) => void withGoogleToken(accessToken)} onError={() => setError(t('login.googleCancelled'))}>
              {(signIn) => (
              <button
                onClick={() => {
                  if (isLoading) return;
                  setError(null);
                  signIn();
                }}
                disabled={isLoading}
                aria-busy={isLoading}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-subtle-color)',
                  backgroundColor: 'var(--bg-input)',
                  color: 'var(--text-heading)',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path
                    fill="#EA4335"
                    d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 10.8 0 12.5s.7 2.8 1.9 5.2l3.7-2.9z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
                  />
                </svg>
                {t('login.google')}
              </button>
              )}
            </GoogleSignIn>
          )}

          {/* Sign in with a passkey already saved on this device: it needs no email, and is added from the account once signed in */}
          {browserSupportsWebAuthn() && (
          <button
            onClick={() => void withPasskey()}
            disabled={isLoading}
            aria-busy={isLoading}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '10px',
              border: '1px solid var(--border-subtle-color)',
              backgroundColor: 'var(--bg-input)',
              color: 'var(--text-heading)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
            }}
          >
            <KeyRound size={18} color="var(--color-profit)" />
            {t('login.passkey')}
          </button>
          )}
        </div>

        {/* Third Box: Sneak Peek Demo Account, only when the server has one */}
        {demoEnabled === true && (
        <div
          style={{
            marginTop: '20px',
            paddingTop: '20px',
            borderTop: '1px solid var(--border-divider)',
            textAlign: 'center',
          }}
        >
          <p
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              margin: '0 0 12px 0',
              lineHeight: 1.45,
            }}
          >
            {t('login.demoBlurb')}
          </p>

          <button
            type="button"
            onClick={() => void asGuest()}
            disabled={isLoading}
            aria-busy={isLoading}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '10px',
              border: '1px solid var(--accent-primary)',
              background: 'var(--gradient-accent-soft)',
              color: 'var(--text-accent)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--gradient-accent-soft-hover)';
              e.currentTarget.style.borderColor = 'var(--accent-blue-light)';
              e.currentTarget.style.color = 'var(--text-accent-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--gradient-accent-soft)';
              e.currentTarget.style.borderColor = 'var(--accent-primary)';
              e.currentTarget.style.color = 'var(--text-accent)';
            }}
          >
            {t('login.demoButton')}
          </button>
        </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            marginTop: '22px',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
          }}
        >
          <ShieldCheck size={14} color="var(--color-profit)" /> {t('login.security')}
        </div>
      </div>
    </div>
  );
}

