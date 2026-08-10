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
          if (data.token) {
            localStorage.setItem('auth_token', data.token);
          }
          localStorage.setItem('auth_user_email', googleUser.email);
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

    const storedEmail = localStorage.getItem('auth_user_email') || 'juan@portfolio.local';

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
        if (verifyData.token) {
          localStorage.setItem('auth_token', verifyData.token);
        }
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

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#000000',
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
          backgroundColor: '#0B0B0C',
          border: '1px solid #1E1E22',
          borderRadius: '16px',
          padding: '36px',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.8)',
          textAlign: 'center',
        }}
      >
        <h2 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 6px 0', color: '#F4F4F5' }}>
          Portfolio Tracker
        </h2>
        <p style={{ color: '#A1A1AA', fontSize: '14px', margin: '0 0 28px 0' }}>
          Passwordless & Biometric Authentication
        </p>

        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: 'rgba(244, 63, 94, 0.15)',
              color: '#F43F5E',
              border: '1px solid rgba(244, 63, 94, 0.3)',
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
              border: '1px solid #27272A',
              backgroundColor: '#161618',
              color: '#F4F4F5',
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
              border: '1px solid #27272A',
              backgroundColor: '#161618',
              color: '#F4F4F5',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
            }}
          >
            <KeyRound size={18} color="#10B981" />
            Continue with Passkey / Touch ID
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '24px', fontSize: '12px', color: '#71717A' }}>
          <ShieldCheck size={14} color="#10B981" /> Zero passwords stored. Encrypted session.
        </div>
      </div>
    </div>
  );
}
