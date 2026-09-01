import { useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

interface User {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

interface LoginModalProps {
  onSuccess: (user: User) => void;
}

export default function LoginModal({ onSuccess }: LoginModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setIsLoading(true);
      setError(null);

      try {
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        });
        const googleUser = await userInfoRes.json();

        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: googleUser.email,
            name: googleUser.name,
            googleId: googleUser.sub,
            avatarUrl: googleUser.picture,
          }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          try {
            if (data.token) {
              localStorage.setItem('auth_token', data.token);
            }
            if (googleUser.email) {
              localStorage.setItem('auth_user_email', googleUser.email);
            }
          } catch (_) {}
          onSuccess(data.user);
        } else {
          setError(data.error || 'Google Sign-In failed.');
        }
      } catch (err) {
        setError('Could not connect to authentication server.');
      } finally {
        setIsLoading(false);
      }
    },
    onError: () => {
      setError('Google Sign-In was cancelled or failed.');
    },
  });

  const handleGoogleSignIn = () => {
    setError(null);
    googleLogin();
  };

  const handlePasskeySignIn = async () => {
    setIsLoading(true);
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
        throw new Error(optData.error || 'Failed to fetch passkey challenge.');
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
        setError(verifyData.error || 'Passkey verification failed.');
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('Passkey prompt was cancelled.');
      } else {
        setError(err.message || 'Passkey authentication error.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoSignIn = async () => {
    setIsLoading(true);
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
        setError(data.error || 'Failed to initialize demo portfolio.');
      }
    } catch (err) {
      setError('Could not connect to authentication server.');
    } finally {
      setIsLoading(false);
    }
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
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          backgroundColor: 'var(--bg-card)',
          border: 'var(--border-card)',
          borderRadius: '16px',
          padding: '36px',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.8)',
          textAlign: 'center',
        }}
      >
        <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-heading)' }}>
          Portfolio Tracker
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '0 0 28px 0' }}>
          Passwordless & Biometric Authentication
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
          {/* Sign in with Google Button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
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
            Continue with Google
          </button>

          {/* Sign in with Passkey Button */}
          <button
            onClick={handlePasskeySignIn}
            disabled={isLoading}
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
            Continue with Passkey / Touch ID
          </button>
        </div>

        {/* Third Box: Sneak Peek Demo Account */}
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
            Explore a demo portfolio with multi-year performance charts, asset allocations, and live analytics.
          </p>

          <button
            type="button"
            onClick={handleDemoSignIn}
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '10px',
              border: '1px solid var(--accent-primary)',
              background: 'linear-gradient(135deg, var(--accent-blue-subtle), rgba(59, 130, 246, 0.06))',
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
              e.currentTarget.style.background =
                'linear-gradient(135deg, rgba(37, 99, 235, 0.28), rgba(59, 130, 246, 0.16))';
              e.currentTarget.style.borderColor = 'var(--accent-blue-light)';
              e.currentTarget.style.color = 'var(--text-accent-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background =
                'linear-gradient(135deg, var(--accent-blue-subtle), rgba(59, 130, 246, 0.06))';
              e.currentTarget.style.borderColor = 'var(--accent-primary)';
              e.currentTarget.style.color = 'var(--text-accent)';
            }}
          >
            <span>👀</span> Would you like to take a sneak peek?
          </button>
        </div>

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
          <ShieldCheck size={14} color="var(--color-profit)" /> Zero passwords stored. Encrypted session.
        </div>
      </div>
    </div>
  );
}

