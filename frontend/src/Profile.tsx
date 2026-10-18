import { useState, type CSSProperties, type FormEvent, type MouseEvent } from 'react'
import { Laptop, LogOut, Moon, Shuffle, Sun } from 'lucide-react'
import { api } from './api'
import Avatar from './Avatar'
import { COLORS } from './Group'
import { makePet, randomPetSeed, speciesOf, SPECIES, type Species } from './pets'
import { headingColor, setHeadingColor, type HeadingColor } from './headings'
import { useSlidingPill } from './Segmented'
import type { ThemePref } from './theme'
import type { Profile as ProfileData } from './types'

const THEMES: { id: ThemePref; label: string; Icon: typeof Sun }[] = [
  { id: 'system', label: 'System', Icon: Laptop },
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'dark', label: 'Dark', Icon: Moon },
]

function useForm() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  async function run(fn: () => Promise<string>) {
    setBusy(true); setMsg(null)
    try { setMsg({ ok: true, text: await fn() }) }
    catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) }) }
    finally { setBusy(false) }
  }
  const note = msg && <p className={msg.ok ? 'note ok' : 'note error'} role="status">{msg.text}</p>
  return { busy, run, note }
}

export default function Profile({ me, onChange, theme, onTheme, onLogout }: {
  me: ProfileData
  onChange: (me: ProfileData) => void
  theme: ThemePref
  onTheme: (pref: ThemePref, origin: { x: number; y: number }) => void
  onLogout: () => void
}) {
  const [displayName, setDisplayName] = useState(me.display_name)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [deletePw, setDeletePw] = useState('')
  const nameForm = useForm(), pwForm = useForm(), deleteForm = useForm()
  const [avatarError, setAvatarError] = useState('')
  const [themeRef, pill] = useSlidingPill<HTMLDivElement>(theme)
  const [headings, setHeadings] = useState(headingColor)

  const { stats } = me
  const since = new Date(me.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  function saveName(e: FormEvent) {
    e.preventDefault()
    nameForm.run(async () => { onChange(await api.updateMe(displayName)); return 'Name saved.' })
  }
  const species = me.avatar_seed ? speciesOf(me.avatar_seed) : null
  const speciesLabel = SPECIES.find(s => s.key === (species ?? 'cat'))!.label.toLowerCase()

  // shows at once (in the top bar too), then saves; seed '' goes back to the initial
  async function setAvatar(seed: string) {
    const before = me
    onChange({ ...me, avatar_seed: seed })
    setAvatarError('')
    try { onChange(await api.updateAvatar(seed)) }
    catch (err) { onChange(before); setAvatarError(err instanceof Error ? err.message : String(err)) }
  }
  const reroll = (kind: Species = species ?? 'cat') => void setAvatar(randomPetSeed(kind))
  function changePassword(e: FormEvent) {
    e.preventDefault()
    pwForm.run(async () => {
      if (next !== confirmPw) throw new Error("New passwords don't match.")
      await api.changePassword(current, next)
      setCurrent(''); setNext(''); setConfirmPw('')
      return 'Password changed.'
    })
  }
  function deleteAccount(e: FormEvent) {
    e.preventDefault()
    if (!confirm('Delete your account and everything in it? This cannot be undone.')) return
    deleteForm.run(async () => { await api.deleteAccount(deletePw); onLogout(); return 'Account deleted.' })
  }
  function pickHeadings(color: HeadingColor) {
    setHeadingColor(color)
    setHeadings(color)
  }
  function pickTheme(id: ThemePref, e: MouseEvent) {
    const r = e.currentTarget.getBoundingClientRect()
    onTheme(id, { x: r.left + r.width / 2, y: r.top + r.height / 2 })
  }

  return (
    <div className="profile">
      <header className="profile-head">
        <Avatar name={me.display_name || me.username} seed={me.avatar_seed} size={64} />
        <div>
          <h1>{me.display_name || me.username}</h1>
          <p className="muted">@{me.username}</p>
          <p className="muted">Member since {since}</p>
        </div>
      </header>

      <section className="panel">
        <h2>Profile picture</h2>
        <div className="pfp">
          <Avatar name={me.display_name || me.username} seed={me.avatar_seed} size={96} />
          <div className="pfp-controls">
            <p className="pfp-kicker">{me.avatar_seed ? makePet(me.avatar_seed).description : 'Your initial, for now'}</p>
            <div className="lecture-filter" role="radiogroup" aria-label="Pet">
              {SPECIES.map(s => (
                <button key={s.key} role="radio" aria-checked={species === s.key} className={'chip' + (species === s.key ? ' on' : '')}
                        onClick={() => species !== s.key && reroll(s.key)}>{s.label}</button>
              ))}
            </div>
            <div className="pfp-buttons">
              <button className="btn-primary" onClick={() => reroll()} title={`Generate a different ${speciesLabel}`}>
                <Shuffle size={15} /> New {speciesLabel}
              </button>
              {me.avatar_seed && <button className="link" onClick={() => void setAvatar('')}>Use my initial</button>}
            </div>
            {avatarError && <p className="note error" role="status">{avatarError}</p>}
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Progress</h2>
        <p className="progress-line">
          <strong>{stats.tasks_done}</strong> of {stats.tasks} tasks done
        </p>
        <div className="meter" aria-hidden="true">
          <span style={{ transform: `scaleX(${stats.tasks ? stats.tasks_done / stats.tasks : 0})` }} />
        </div>
        <dl className="figures">
          <div><dt>Semesters</dt><dd>{stats.semesters}</dd></div>
          <div><dt>Subjects</dt><dd>{stats.subjects}</dd></div>
          <div><dt>Projects</dt><dd>{stats.projects}</dd></div>
          <div><dt>Personal lists</dt><dd>{stats.personal_lists}</dd></div>
          <div><dt>Journal entries</dt><dd>{stats.journal_entries}</dd></div>
        </dl>
      </section>

      <section className="panel">
        <h2>Appearance</h2>
        <div className="seg theme-seg" ref={themeRef} role="radiogroup" aria-label="Theme">
          <span className="seg-pill" style={pill} />
          {THEMES.map(({ id, label, Icon }) => (
            <button key={id} role="radio" aria-checked={theme === id} className="seg-btn" data-active={theme === id}
                    onClick={e => pickTheme(id, e)}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        <p className="muted small">System follows your device's light or dark setting.</p>
        <h3>Note headings</h3>
        <div className="swatches heading-swatches" role="radiogroup" aria-label="Note heading color">
          <button role="radio" aria-checked={headings === 'none'} className={'swatch swatch-none' + (headings === 'none' ? ' current' : '')}
                  style={{ '--i': 0 } as CSSProperties} aria-label="No color" title="No color" onClick={() => pickHeadings('none')} />
          {COLORS.map((c, i) => (
            <button key={c} role="radio" aria-checked={headings === c} className={`swatch c-${c}` + (headings === c ? ' current' : '')}
                    style={{ '--i': i + 1 } as CSSProperties} aria-label={c} title={c} onClick={() => pickHeadings(c)} />
          ))}
        </div>
        <p className="muted small">Colors the headings in lecture notes, on screen and in saved PDFs.</p>
      </section>

      <section className="panel">
        <h2>Display name</h2>
        <form className="row-form" onSubmit={saveName}>
          <input className="text-input" value={displayName} maxLength={120} placeholder={me.username}
                 aria-label="Display name" onChange={e => setDisplayName(e.target.value)} />
          <button className="btn-primary" disabled={nameForm.busy || displayName === me.display_name}>Save name</button>
        </form>
        {nameForm.note}
      </section>

      <section className="panel">
        <h2>Password</h2>
        <form className="stack-form" onSubmit={changePassword}>
          <label className="field"><span>Current password</span>
            <input type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" required />
          </label>
          <label className="field"><span>New password</span>
            <input type="password" value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" minLength={6} required />
          </label>
          <label className="field"><span>Repeat new password</span>
            <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} autoComplete="new-password" minLength={6} required />
          </label>
          <button className="btn-primary" disabled={pwForm.busy}>Change password</button>
        </form>
        {pwForm.note}
      </section>

      <section className="panel">
        <h2>Session</h2>
        <button className="btn danger" onClick={onLogout}><LogOut size={15} /> Log out</button>
      </section>

      <section className="panel panel-danger">
        <h2>Delete account</h2>
        <p className="muted small">Removes your account with all semesters, projects, personal lists, tasks, notes and journal entries.</p>
        <form className="row-form" onSubmit={deleteAccount}>
          <input className="text-input" type="password" value={deletePw} onChange={e => setDeletePw(e.target.value)}
                 placeholder="Your password" aria-label="Password to confirm" autoComplete="current-password" required />
          <button className="btn danger" disabled={deleteForm.busy}>Delete account</button>
        </form>
        {deleteForm.note}
      </section>
    </div>
  )
}
