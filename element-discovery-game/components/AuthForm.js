'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AuthForm({ mode }) {
  const router = useRouter();
  const [f, setF] = useState({ username: '', email: '', identifier: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    const res = await fetch(`/api/auth/${mode}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Something went wrong');
    router.push('/play'); router.refresh();
  }

  return (
    <div className="card" style={{ maxWidth: 420, margin: '3rem auto' }}>
      <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
      <form onSubmit={submit}>
        {mode === 'register' ? (
          <>
            <label>Username</label><input value={f.username} onChange={set('username')} required autoFocus />
            <label>Email</label><input type="email" value={f.email} onChange={set('email')} required />
          </>
        ) : (
          <><label>Email or username</label><input value={f.identifier} onChange={set('identifier')} required autoFocus /></>
        )}
        <label>Password</label><input type="password" value={f.password} onChange={set('password')} required minLength={6} />
        {error && <div className="err">{error}</div>}
        <div className="row" style={{ marginTop: '1rem' }}>
          <button disabled={busy}>{mode === 'login' ? 'Sign in' : 'Sign up'}</button>
          <span className="muted small">
            {mode === 'login' ? <>New here? <Link href="/register">Create an account</Link></> : <>Have an account? <Link href="/login">Sign in</Link></>}
          </span>
        </div>
      </form>
    </div>
  );
}
