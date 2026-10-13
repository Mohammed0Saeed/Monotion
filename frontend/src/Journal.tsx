import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Angry, ArrowLeft, FlaskConical, Frown, Laugh, Meh, Plus, Smile, Trash2 } from 'lucide-react'
import { api } from './api'
import type { JournalEntry, JournalPatch } from './types'

const MOODS = [
  { value: 1, label: 'Rough', Icon: Angry },
  { value: 2, label: 'Low', Icon: Frown },
  { value: 3, label: 'Okay', Icon: Meh },
  { value: 4, label: 'Good', Icon: Smile },
  { value: 5, label: 'Great', Icon: Laugh },
]
const SAVE_DELAY = 700

const today = () => new Date().toLocaleDateString('en-CA') // yyyy-mm-dd in local time
const parse = (d: string) => new Date(d + 'T00:00:00')
const monthLabel = (d: string) => parse(d).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
const dayLabel = (d: string) => parse(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
const longDate = (d: string) => parse(d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const excerpt = (body: string) => body.replace(/\s+/g, ' ').trim().slice(0, 90)

function MoodIcon({ mood, size = 15 }: { mood: number | null; size?: number }) {
  const m = MOODS.find(x => x.value === mood)
  return m ? <m.Icon size={size} aria-label={m.label} /> : null
}

function Editor({ entry, onSaved, onDelete, onBack }: {
  entry: JournalEntry
  onSaved: (e: JournalEntry) => void
  onDelete: () => void
  onBack: () => void
}) {
  const [draft, setDraft] = useState(entry)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const pending = useRef<JournalPatch>({})
  const timer = useRef<number | undefined>(undefined)
  const body = useRef<HTMLTextAreaElement>(null)

  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    const patch = pending.current
    pending.current = {}
    if (!Object.keys(patch).length) return
    setStatus('saving')
    try {
      onSaved(await api.updateJournal(entry.id, patch))
      setStatus('saved')
    } catch {
      pending.current = { ...patch, ...pending.current } // keep it for the next attempt
      setStatus('error')
    }
  }, [entry.id, onSaved])

  // save whatever is pending when switching entries, leaving the page, or hiding the tab
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && void flush()
    document.addEventListener('visibilitychange', onHide)
    return () => { document.removeEventListener('visibilitychange', onHide); void flush() }
  }, [flush])

  // grow the textarea with its content
  useLayoutEffect(() => {
    const el = body.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [draft.body])

  function change(patch: JournalPatch) {
    setDraft(d => ({ ...d, ...patch, ...(patch.clear_mood && { mood: null }) }))
    pending.current = { ...pending.current, ...patch }
    if (patch.mood) delete pending.current.clear_mood
    if (patch.clear_mood) delete pending.current.mood
    setStatus('idle')
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flush(), SAVE_DELAY)
  }

  const statusText = { idle: '', saving: 'Saving…', saved: 'Saved', error: "Couldn't save. Retrying when you type." }[status]

  return (
    <article className="editor">
      <div className="editor-bar">
        <button className="link back" onClick={() => { void flush(); onBack() }}><ArrowLeft size={15} /> Entries</button>
        <input type="date" className="date-input" value={draft.entry_date} aria-label="Entry date"
               onChange={e => e.target.value && change({ entry_date: e.target.value })} />
        <span className={'save-status ' + status} role="status">{statusText}</span>
        <button className="btn danger icon-only" aria-label="Delete entry" title="Delete entry"
                onClick={() => { if (!confirm('Delete this entry?')) return; pending.current = {}; clearTimeout(timer.current); onDelete() }}>
          <Trash2 size={15} />
        </button>
      </div>
      <p className="muted editor-date">{longDate(draft.entry_date)}</p>
      <input className="entry-title" value={draft.title} placeholder="Untitled" aria-label="Title" maxLength={300}
             onChange={e => change({ title: e.target.value })} />
      <div className="moods" role="radiogroup" aria-label="Mood">
        {MOODS.map(({ value, label, Icon }) => (
          <button key={value} role="radio" aria-checked={draft.mood === value} title={label}
                  className={'mood' + (draft.mood === value ? ' on' : '')}
                  onClick={() => change(draft.mood === value ? { clear_mood: true } : { mood: value })}>
            <Icon size={18} /><span>{label}</span>
          </button>
        ))}
      </div>
      <textarea ref={body} className="entry-body" value={draft.body} rows={8} aria-label="Entry"
                placeholder="What happened today? What did you learn, what's on your mind?"
                onChange={e => change({ body: e.target.value })} />
    </article>
  )
}

export default function Journal() {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null)
  const [selected, setSelected] = useState<number | null>(null)

  useEffect(() => { api.journal().then(setEntries) }, [])

  const onSaved = useCallback((saved: JournalEntry) => {
    setEntries(es => es && es.map(e => (e.id === saved.id ? saved : e)))
  }, [])

  if (!entries) return <div className="loading">Loading…</div>

  const sorted = [...entries].sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.id - a.id)
  const current = sorted.find(e => e.id === selected)
  const months: [string, JournalEntry[]][] = []
  for (const e of sorted) {
    const m = monthLabel(e.entry_date)
    if (months.at(-1)?.[0] !== m) months.push([m, []])
    months.at(-1)![1].push(e)
  }

  async function create() {
    const e = await api.addJournal(today())
    setEntries(es => es && [e, ...es])
    setSelected(e.id)
  }
  async function remove(id: number) {
    await api.deleteJournal(id)
    setEntries(es => es && es.filter(e => e.id !== id))
    setSelected(null)
  }

  return (
    <div className="journal" data-view={current ? 'editor' : 'list'}>
      <aside className="journal-list">
        <div className="journal-head">
          <h1>Journal</h1>
          <span className="tag" title="This section is new and may change"><FlaskConical size={12} /> Experimental</span>
        </div>
        <p className="muted small">A private daily log. Entries save as you type.</p>
        <button className="btn-primary new-entry" onClick={create}><Plus size={15} /> New entry for today</button>
        {months.map(([month, list]) => (
          <section key={month} className="month">
            <h2>{month}</h2>
            {list.map(e => (
              <button key={e.id} className={'entry-item' + (e.id === selected ? ' active' : '')} onClick={() => setSelected(e.id)}>
                <span className="entry-day">{dayLabel(e.entry_date)}</span>
                <span className="entry-text">
                  <span className="entry-name">{e.title || 'Untitled'}</span>
                  {excerpt(e.body) && <span className="entry-excerpt">{excerpt(e.body)}</span>}
                </span>
                <MoodIcon mood={e.mood} />
              </button>
            ))}
          </section>
        ))}
        {!entries.length && <p className="muted small empty-note">No entries yet. Start with today.</p>}
      </aside>
      {current ? (
        <Editor key={current.id} entry={current} onSaved={onSaved} onBack={() => setSelected(null)}
                onDelete={() => void remove(current.id)} />
      ) : (
        <div className="editor-empty muted">
          {entries.length ? 'Pick an entry, or start one for today.' : 'Your entries will show up here.'}
        </div>
      )}
    </div>
  )
}
