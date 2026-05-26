import { useState } from 'react';
import type { FormEvent } from 'react';
import { KeyRound, Mail, UserPlus, Lock } from 'lucide-react';

interface LoginModalProps {
  onSuccess: (user: { id: string; email: string }) => void;
}

export default function LoginModal({ onSuccess }: LoginModalProps) {
  const [tab, setTab] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passcode, setPasscode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setStatusMsg('');
    setIsSubmitting(true);

    try {
      if (tab === 'signin') {
        const res = await fetch('/api/auth/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (res.ok) {
          onSuccess(data.user);
        } else {
          setError(data.error || 'Failed to sign in.');
        }
      } else if (tab === 'signup') {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (res.ok) {
          onSuccess(data.user);
        } else {
          setError(data.error || 'Failed to sign up.');
        }
      } else if (tab === 'forgot') {
        const res = await fetch('/api/auth/recover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, passcode, newPassword }),
        });
        const data = await res.json();
        if (res.ok) {
          setStatusMsg('Password reset successful. You can now Sign In.');
          setTab('signin');
          setPassword('');
        } else {
          setError(data.error || 'Failed to reset password.');
        }
      }
    } catch (err) {
      setError('Connection to auth server failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(8, 8, 8, 0.75)',
        backdropFilter: 'blur(32px)',
        WebkitBackdropFilter: 'blur(32px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
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
          padding: '32px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: 'rgba(0, 102, 255, 0.1)',
              color: 'var(--accent-primary)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
            }}
          >
            {tab === 'signin' && <KeyRound size={24} />}
            {tab === 'signup' && <UserPlus size={24} />}
            {tab === 'forgot' && <Lock size={24} />}
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px 0', letterSpacing: '-0.5px' }}>
            {tab === 'signin' && 'Welcome back'}
            {tab === 'signup' && 'Create account'}
            {tab === 'forgot' && 'Reset password'}
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
            {tab === 'signin' && 'Enter your credentials to unlock your dashboard'}
            {tab === 'signup' && 'Get started with your regional allocation engine'}
            {tab === 'forgot' && 'Use your 2-Factor passcode to verify ownership'}
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            backgroundColor: '#080808',
            border: 'var(--border-card)',
            borderRadius: '8px',
            padding: '4px',
          }}
        >
          <button
            type="button"
            onClick={() => { setTab('signin'); setError(''); setStatusMsg(''); }}
            style={{
              flex: 1,
              padding: '8px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: tab === 'signin' ? 'var(--accent-primary)' : 'transparent',
              color: tab === 'signin' ? '#FFFFFF' : 'var(--text-secondary)',
              transition: 'all 0.2s',
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setTab('signup'); setError(''); setStatusMsg(''); }}
            style={{
              flex: 1,
              padding: '8px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: tab === 'signup' ? 'var(--accent-primary)' : 'transparent',
              color: tab === 'signup' ? '#FFFFFF' : 'var(--text-secondary)',
              transition: 'all 0.2s',
            }}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-secondary)' }}>
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} color="var(--text-secondary)" style={{ position: 'absolute', left: '14px', top: '14px' }} />
              <input
                type="text"
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '12px 14px 12px 40px',
                  borderRadius: '8px',
                  border: '1px solid #1F1F23',
                  backgroundColor: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {tab !== 'forgot' && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  border: '1px solid #1F1F23',
                  backgroundColor: 'var(--bg-input)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
            </div>
          )}

          {tab === 'forgot' && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  2FA Passcode
                </label>
                <input
                  type="text"
                  placeholder="e.g. 123456"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid #1F1F23',
                    backgroundColor: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  New Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid #1F1F23',
                    backgroundColor: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                />
              </div>
            </>
          )}

          {error && (
            <div style={{ fontSize: '13px', color: 'var(--color-danger)', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '10px', borderRadius: '6px', textAlign: 'center', fontWeight: 500 }}>
              {error}
            </div>
          )}

          {statusMsg && (
            <div style={{ fontSize: '13px', color: 'var(--color-success)', backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', padding: '10px', borderRadius: '6px', textAlign: 'center', fontWeight: 500 }}>
              {statusMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: 'var(--accent-primary)',
              color: '#FFFFFF',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              marginTop: '8px',
              transition: 'all 0.2s',
            }}
          >
            {isSubmitting ? 'Processing...' : tab === 'signin' ? 'Sign In' : tab === 'signup' ? 'Sign Up' : 'Reset Password'}
          </button>
        </form>

        {tab === 'signin' && (
          <div style={{ textAlign: 'center', marginTop: '-8px' }}>
            <button
              type="button"
              onClick={() => { setTab('forgot'); setError(''); setStatusMsg(''); }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: '13px',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Forgot your password?
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
