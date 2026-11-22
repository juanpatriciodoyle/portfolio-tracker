import { useState } from 'react';
import { useSubmitOnce } from '../hooks/useSubmitOnce';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { useAppConfig } from '../hooks/useAppConfig';
import { isGoogleSignInConfigured } from '../lib/googleConfig';
import LanguageSelector from '../i18n/LanguageSelector';
import { useTranslation } from '../i18n/useTranslation';
import { serverMessage } from '../lib/serverMessages';
import GoogleSignIn from './GoogleSignIn';

/** A refusal already worded for the person, as opposed to a raw error from the browser. */
class Refusal extends Error {}

interface User {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  isAdmin?: boolean;
}

interface LoginModalProps {
  onSuccess: (user: User) => void;
}

export default function LoginModal({ onSuccess }: LoginModalProps) {
  const words = useTranslation();
  const { t } = words;
  const { run, pending: isLoading } = useSubmitOnce();
  const [error, setError] = useState<string | null>(null);
  const { demoEnabled } = useAppConfig();

  const signInWithGoogleToken = (accessToken: string) =>
    run(async () => {
      setError(null);

      try {
        // Only Google's token goes to the server, which asks Google who it belongs to. What the browser says is never trusted.
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          try {
            if (data.token) {
              localStorage.setItem('auth_token', data.token);
            }
            if (data.user?.email) {
              localStorage.setItem('auth_user_email', data.user.email);
            }
          } catch (_) {}
          onSuccess(data.user);
        } else {
          setError(serverMessage(data, words, 'login.googleFailed'));
        }
      } catch (err) {
        setError(t('error.network'));
      }
    });

  const handlePasskeySignIn = async () => {
    await run(async () => {
      setError(null);

      let storedEmail = 'juan@portfolio.local';
      try {
        storedEmail = localStorage.getItem('auth_user_email') || 'juan@portfolio.local';
      } catch (_) {}

      try {
        // 1. Get WebAuthn options from server
        const optRes = await fetch('/api/auth/passkey/generate-options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: storedEmail }),
        });

        const optData = await optRes.json();
        if (!optRes.ok) {
          throw new Refusal(serverMessage(optData, words, 'login.passkeyChallenge'));
        }

        // 2. Trigger native browser TouchID / FaceID prompt
        let credentialResponse;
        if (optData.isRegistration) {
          credentialResponse = await startRegistration({ optionsJSON: optData.options });
        } else {
          credentialResponse = await startAuthentication({ optionsJSON: optData.options });
        }

        // 3. Verify signed credential response on server
        const verifyRes = await fetch('/api/auth/passkey/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: storedEmail,
            credential: credentialResponse,
          }),
        });

        const verifyData = await verifyRes.json();
        if (verifyRes.ok && verifyData.success) {
          try {
            if (verifyData.token) {
              localStorage.setItem('auth_token', verifyData.token);
            }
          } catch (_) {}
          onSuccess(verifyData.user);
        } else {
          setError(serverMessage(verifyData, words, 'login.passkeyVerify'));
        }
      } catch (err: unknown) {
        const failure = err instanceof Error ? err : null;
        if (failure?.name === 'NotAllowedError') {
          setError(t('login.passkeyCancelled'));
        } else if (failure instanceof Refusal) {
          setError(failure.message);
        } else if (words.locale === 'en' && failure?.message) {
          setError(failure.message);
        } else {
          setError(t('login.passkeyError'));
        }
      }
    });
  };

  const handleDemoSignIn = async () => {
    await run(async () => {
      setError(null);

      try {
        const res = await fetch('/api/auth/demo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        const data = await res.json();
        if (res.ok && data.success) {
          const demoUser = {
            ...data.user,
            name: 'Joe',
          };
          try {
            if (data.token) {
              localStorage.setItem('auth_token', data.token);
            }
            if (demoUser.email) {
              localStorage.setItem('auth_user_email', demoUser.email);
            }
            localStorage.setItem('auth_user', JSON.stringify(demoUser));
          } catch (_) {}
          onSuccess(demoUser);
        } else {
          setError(serverMessage(data, words, 'login.demoFailed'));
        }
      } catch (err) {
        setError(t('error.network'));
      }
    });
  };

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

        {error && (
          <div
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
            <GoogleSignIn onToken={(accessToken) => void signInWithGoogleToken(accessToken)} onError={() => setError(t('login.googleCancelled'))}>
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

          {/* Sign in with Passkey Button */}
          <button
            onClick={handlePasskeySignIn}
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
              fontSize: '12px',
              color: 'var(--text-muted)',
              margin: '0 0 12px 0',
              lineHeight: 1.45,
            }}
          >
            {t('login.demoBlurb')}
          </p>

          <button
            type="button"
            onClick={handleDemoSignIn}
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
            <span>👀</span> {t('login.demoButton')}
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
            fontSize: '12px',
            color: 'var(--text-muted)',
          }}
        >
          <ShieldCheck size={14} color="var(--color-profit)" /> {t('login.security')}
        </div>
      </div>
    </div>
  );
}

