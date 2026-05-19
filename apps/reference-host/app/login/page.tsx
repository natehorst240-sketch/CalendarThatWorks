'use client';

import { useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setError(null);
    const supabase = createClient();
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback?next=/dashboard` },
    });
    if (err) {
      setError(err.message);
      setStatus('error');
      return;
    }
    setStatus('sent');
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: 360,
          background: '#fff8ea',
          border: '1px solid rgba(61,43,31,0.2)',
          borderRadius: 6,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Sign in</h1>
        <p style={{ margin: 0, fontSize: 13, color: '#5a3e2b' }}>
          We'll email you a magic link. No password to remember.
        </p>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@flightschool.test"
          disabled={status === 'sending' || status === 'sent'}
          style={{
            padding: '8px 10px',
            border: '1px solid rgba(61,43,31,0.3)',
            borderRadius: 4,
            background: '#fff',
            fontSize: 14,
          }}
        />
        <button
          type="submit"
          disabled={status === 'sending' || status === 'sent' || !email}
          style={{
            padding: '8px 12px',
            background: '#3d2b1f',
            color: '#f5e6c8',
            border: 'none',
            borderRadius: 4,
            fontSize: 14,
            fontWeight: 600,
            cursor: status === 'sending' ? 'wait' : 'pointer',
          }}
        >
          {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Check your inbox' : 'Send magic link'}
        </button>
        {status === 'sent' && (
          <p style={{ margin: 0, fontSize: 12, color: '#3d2b1f' }}>
            Link sent to <strong>{email}</strong>. Open it on this device to sign in.
          </p>
        )}
        {status === 'error' && error && (
          <p style={{ margin: 0, fontSize: 12, color: '#c0392b' }}>{error}</p>
        )}
      </form>
    </main>
  );
}
