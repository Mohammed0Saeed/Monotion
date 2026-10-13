import { useState, type FormEvent } from 'react'
import { api, auth } from './api'
import Logo from './Logo'

export default function Login({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const isLogin = mode === 'login'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const res = await (isLogin ? api.login : api.register)(username, password)
      auth.set(res.access_token, res.username)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setAttempt(a => a + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login" onSubmit={submit}>
        <h1><Logo size={30} /> Monotion</h1>
        <p className="muted">{isLogin ? 'Sign in to your tasks.' : 'Create an account for this server.'}</p>
        <label className="field">
          <span>Username</span>
          <input autoFocus value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
                 autoComplete={isLogin ? 'current-password' : 'new-password'} />
        </label>
        {error && <div className="error" key={attempt}>{error}</div>}
        <button className="btn-primary" disabled={busy}>{isLogin ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="link switch" onClick={() => { setMode(isLogin ? 'register' : 'login'); setError('') }}>
          {isLogin ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}
