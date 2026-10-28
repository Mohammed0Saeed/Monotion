import { useEffect, useState, type FormEvent } from 'react'
import { CalendarClock, ChevronRight, Eye, EyeOff, Plus, Repeat, Trash2, X } from 'lucide-react'
import { api } from './api'
import { Check } from './Group'
import type { Deadline, DeadlineRepeat } from './types'

/** a deadline just ticked off stays long enough to show the check, then slides out (see .finishing in styles.css) */
const FINISH_MS = 900
const MAX_REPEATS = 100

/** what a deadline needs to know about a lecture */
type Lecture = { id: number; name: string; color: string }

const REPEATS: { id: DeadlineRepeat; label: string; unit: string }[] = [
  { id: 'none', label: 'Once', unit: '' },
  { id: 'daily', label: 'Every day', unit: 'days' },
  { id: 'weekly', label: 'Every week', unit: 'weeks' },
  { id: 'biweekly', label: 'Every 2 weeks', unit: 'times' },
  { id: 'monthly', label: 'Every month', unit: 'months' },
]

const today = () => new Date().toLocaleDateString('en-CA') // yyyy-mm-dd in local time
const parse = (d: string) => new Date(d + 'T00:00:00')
const daysFromToday = (d: string) => Math.round((parse(d).getTime() - parse(today()).getTime()) / 864e5)
const dateLabel = (d: string) => parse(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

function whenLabel(d: string) {
  const n = daysFromToday(d)
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  if (n === -1) return '1 day overdue'
  return n < 0 ? `${-n} days overdue` : `in ${n} days`
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

function AddForm({ subjects, onAdd, onClose }: {
  subjects: Lecture[]
  onAdd: (title: string, date: string, subjectId: number | undefined, repeat: DeadlineRepeat, count: number) => Promise<void>
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(today)
  const [subject, setSubject] = useState('')
  const [repeat, setRepeat] = useState<DeadlineRepeat>('none')
  const [count, setCount] = useState(4)
  const [busy, setBusy] = useState(false)
  const unit = REPEATS.find(r => r.id === repeat)!.unit
  const valid = title.trim() !== '' && date !== '' && (repeat === 'none' || (Number.isInteger(count) && count >= 1 && count <= MAX_REPEATS))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    try {
      await onAdd(title.trim(), date, subject ? Number(subject) : undefined, repeat, repeat === 'none' ? 1 : count)
      onClose()
    } finally { setBusy(false) }
  }

  return (
    <form className="dl-form" onSubmit={submit} onKeyDown={e => e.key === 'Escape' && onClose()}>
      <input className="inline-input dl-title" autoFocus placeholder="Deadline, e.g. Exercise sheet" aria-label="Deadline"
             value={title} onChange={e => setTitle(e.target.value)} />
      <input type="date" className="date-input" aria-label="Due date" value={date} onChange={e => setDate(e.target.value)} />
      <select className="date-input" aria-label="Lecture" value={subject} onChange={e => setSubject(e.target.value)}>
        <option value="">No lecture</option>
        {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select className="date-input" aria-label="Repeat" value={repeat} onChange={e => setRepeat(e.target.value as DeadlineRepeat)}>
        {REPEATS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
      </select>
      {repeat !== 'none' && (
        <label className="dl-count">
          for
          <input type="number" className="date-input" min={1} max={MAX_REPEATS} value={Number.isNaN(count) ? '' : count}
                 aria-label={`Number of ${unit}`} onChange={e => setCount(e.target.valueAsNumber)} />
          {unit}
        </label>
      )}
      <span className="dl-form-actions">
        <button type="submit" className="btn-primary" disabled={!valid || busy}>Add</button>
        <button type="button" className="link" onClick={onClose}>Cancel</button>
      </span>
    </form>
  )
}

function Row({ item, subject, series, finishing, onDone, onRemove }: {
  item: Deadline
  subject: Lecture | undefined
  series: number          // occurrences of this deadline's repeat still in the list
  finishing: boolean
  onDone: (done: boolean) => void
  onRemove: (series: boolean) => void
}) {
  const late = !item.done && daysFromToday(item.due_date) < 0
  return (
    <div className={'dl-node' + (finishing ? ' finishing' : '')}>
      <div className="dl-clip">
        <div className={'dl-block' + (item.done ? ' done' : '') + (late ? ' late' : '') + (subject ? ` c-${subject.color}` : '')}>
          <div className="dl-top">
            <span className="dl-date">{dateLabel(item.due_date)}</span>
            <span className="dl-actions">
              {series > 1 && (
                <button className="danger" title={`Delete all ${series} repeats`} aria-label={`Delete all ${series} repeats of ${item.title}`}
                        onClick={() => confirm(`Delete all ${series} repeats of "${item.title}"?`) && onRemove(true)}>
                  <Trash2 size={14} />
                </button>
              )}
              <button className="danger" title="Delete" aria-label={`Delete ${item.title}`} onClick={() => onRemove(false)}><X size={15} /></button>
            </span>
          </div>
          <div className="dl-main">
            <Check checked={item.done} label={item.title} onChange={onDone} />
            <span className="dl-title" title={item.title}>{item.title}</span>
          </div>
          <div className="dl-meta">
            {subject && <span className="dl-subject"><i className="chip-dot" />{subject.name}</span>}
            {item.series_id && (
              <span className="dl-series" title={`Repeat ${item.occurrence} of ${item.series_total}`}><Repeat size={12} />{item.occurrence}/{item.series_total}</span>
            )}
            {!item.done && <span className="dl-when">{whenLabel(item.due_date)}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Deadlines of every lecture, soonest first as blocks in one row, above the task cards. Done ones are hidden until asked for. */
export default function Deadlines({ subjects }: { subjects: Lecture[] }) {
  const [items, setItems] = useState<Deadline[] | null>(null)
  const [open, setOpen] = useState(() => localStorage.getItem('maki_deadlines') !== 'closed')
  const [adding, setAdding] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [finishing, setFinishing] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')

  useEffect(() => { api.deadlines().then(setItems).catch(err => setError(errorText(err))) }, [])
  useEffect(() => { localStorage.setItem('maki_deadlines', open ? 'open' : 'closed') }, [open])

  if (!items) return error ? <p className="note error deadlines-error" role="status">{error}</p> : null

  const subjectOf = new Map(subjects.map(s => [s.id, s]))
  const pending = items.filter(d => !d.done)
  const doneCount = items.length - pending.length
  const shown = items.filter(d => showDone || !d.done || finishing.has(d.id))
  const seriesSize = (d: Deadline) => (d.series_id ? items.filter(x => x.series_id === d.series_id).length : 1)
  const overdue = pending.filter(d => daysFromToday(d.due_date) < 0).length

  async function add(title: string, due_date: string, subject_id: number | undefined, repeat: DeadlineRepeat, count: number) {
    setError('')
    try {
      const made = await api.addDeadline({ title, due_date, subject_id, repeat, count })
      setItems(xs => xs && [...xs, ...made].sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id))
    } catch (err) { setError(errorText(err)); throw err }
  }
  async function setDone(d: Deadline, done: boolean) {
    setError('')
    if (done && !showDone) {
      setFinishing(f => new Set(f).add(d.id))
      setTimeout(() => setFinishing(f => { const n = new Set(f); n.delete(d.id); return n }), FINISH_MS)
    }
    setItems(xs => xs && xs.map(x => (x.id === d.id ? { ...x, done } : x)))
    try { await api.updateDeadline(d.id, { done }) } catch (err) {
      setError(errorText(err))
      setItems(xs => xs && xs.map(x => (x.id === d.id ? { ...x, done: d.done } : x)))
    }
  }
  async function remove(d: Deadline, series: boolean) {
    setError('')
    try {
      await api.deleteDeadline(d.id, series)
      setItems(xs => xs && xs.filter(x => (series && d.series_id ? x.series_id !== d.series_id : x.id !== d.id)))
    } catch (err) { setError(errorText(err)) }
  }

  return (
    <section className="deadlines" data-open={open} aria-label="Deadlines">
      <div className="dl-card">
        <header className="dl-head">
          <button className="dl-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            <ChevronRight size={15} className="dl-chevron" />
            <CalendarClock size={16} />
            <h2>Deadlines</h2>
            <span className="count">
              {pending.length ? `${pending.length} open` : 'none open'}
              {overdue > 0 && <span className="dl-overdue"> · {overdue} overdue</span>}
            </span>
          </button>
          {!adding && <button className="ghost-btn" onClick={() => { setOpen(true); setAdding(true) }}><Plus size={14} /> Deadline</button>}
        </header>
        {open && (
          <div className="dl-body">
            {adding && <AddForm subjects={subjects} onAdd={add} onClose={() => setAdding(false)} />}
            {!shown.length && !adding && <p className="muted small dl-empty">No deadlines. Add one, and let it repeat if it comes back every week.</p>}
            <div className="dl-list">
              {shown.map(d => (
                <Row key={d.id} item={d} subject={d.subject_id !== null ? subjectOf.get(d.subject_id) : undefined}
                     series={seriesSize(d)}
                     finishing={d.done && finishing.has(d.id)}
                     onDone={done => void setDone(d, done)} onRemove={series => void remove(d, series)} />
              ))}
            </div>
            {doneCount > 0 && (
              <button className="add-row show-done" aria-pressed={showDone} onClick={() => setShowDone(!showDone)}>
                {showDone ? <EyeOff size={15} /> : <Eye size={15} />} {showDone ? 'Hide completed' : `Show ${doneCount} completed`}
              </button>
            )}
            {error && <p className="note error" role="status">{error}</p>}
          </div>
        )}
      </div>
    </section>
  )
}
