import {
  useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type KeyboardEvent, type MouseEvent,
} from 'react'
import { ArrowLeft, Code, Download, Eye, FileDown, Link2, PenLine, Plus, Trash2 } from 'lucide-react'
import { api } from './api'
import { renderMarkdown, type RefLookup } from './markdown'
import { useSlidingPill } from './Segmented'
import type { Note, NotePatch, NotesIndex, NoteSummary, Semester } from './types'

const SAVE_DELAY = 700

const today = () => new Date().toLocaleDateString('en-CA') // yyyy-mm-dd in local time
const parse = (d: string) => new Date(d + 'T00:00:00')
const monthLabel = (d: string) => parse(d).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
const dayLabel = (d: string) => parse(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
const shortDate = (d: string) => parse(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const summary = ({ id, subject_id, note_date, title, updated_at }: Note): NoteSummary =>
  ({ id, subject_id, note_date, title, updated_at })

type RefKind = 'note' | 'lecture'
interface Candidate { kind: RefKind; id: number; label: string; hint: string; color: string }

function useLookup(index: NotesIndex | null): RefLookup {
  return useMemo(() => {
    const subjects = new Map(index?.subjects.map(s => [s.id, s]))
    const notes = new Map(index?.notes.map(n => [n.id, n]))
    return {
      note(id) {
        const n = notes.get(id)
        return n && { label: n.title || 'Untitled', hint: `${subjects.get(n.subject_id)?.name} · ${shortDate(n.note_date)}` }
      },
      lecture(id) {
        const s = subjects.get(id)
        return s && { label: s.name, hint: `Lecture · ${s.semester}`, color: s.color }
      },
    }
  }, [index])
}

/** Where the caret sits inside a textarea, measured with an invisible copy of it. */
const MIRRORED = ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth',
  'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'fontFamily', 'fontSize', 'fontWeight', 'fontStretch',
  'fontStyle', 'fontVariationSettings', 'letterSpacing', 'lineHeight', 'wordSpacing', 'tabSize'] as const
function caretXY(el: HTMLTextAreaElement, pos: number) {
  const style = getComputedStyle(el)
  const mirror = document.createElement('div')
  for (const p of MIRRORED) mirror.style[p] = style[p]
  Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' })
  mirror.textContent = el.value.slice(0, pos)
  const mark = mirror.appendChild(document.createElement('span'))
  mark.textContent = '​'
  document.body.append(mirror)
  const xy = { x: mark.offsetLeft, y: mark.offsetTop + mark.offsetHeight }
  mirror.remove()
  return xy
}

/** The clipboard API only exists on https and localhost; over plain http on the LAN fall back to a hidden textarea. */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text, readOnly: true })
    Object.assign(ta.style, { position: 'fixed', opacity: '0' })
    document.body.append(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

/** inside a ``` code fence: an odd number of fence lines above the caret's line */
const inFence = (text: string, pos: number) =>
  (text.slice(0, text.lastIndexOf('\n', pos - 1) + 1).match(/^\s*```/gm)?.length ?? 0) % 2 === 1

/** Where the writing pane scrolls on its own (tablet and up), keep the caret's line inside it. */
function keepCaretVisible(el: HTMLTextAreaElement) {
  const pane = el.parentElement
  if (!pane || pane.scrollHeight <= pane.clientHeight) return // the page scrolls instead
  const line = parseFloat(getComputedStyle(el).lineHeight) || 24
  const y = el.offsetTop + caretXY(el, el.selectionEnd).y
  if (y - line < pane.scrollTop) pane.scrollTop = y - line - 8
  else if (y + 16 > pane.scrollTop + pane.clientHeight) pane.scrollTop = y + 16 - pane.clientHeight
}

function Preview({ source, refs, onRef }: { source: string; refs: RefLookup; onRef: (kind: RefKind, id: number) => void }) {
  const html = useMemo(() => renderMarkdown(source, refs), [source, refs])
  function click(e: MouseEvent) {
    const copy = (e.target as HTMLElement).closest<HTMLButtonElement>('.code-copy')
    if (copy) {
      const code = copy.closest('.code-block')?.querySelector('code')?.textContent ?? ''
      void copyText(code).then(ok => {
        copy.textContent = ok ? 'Copied' : 'Copy failed'
        setTimeout(() => { copy.textContent = 'Copy' }, 1500)
      })
      return
    }
    const a = (e.target as HTMLElement).closest<HTMLElement>('a.ref')
    if (!a) return
    e.preventDefault()
    if (a.dataset.note) onRef('note', Number(a.dataset.note))
    else if (a.dataset.lecture) onRef('lecture', Number(a.dataset.lecture))
  }
  if (!source.trim()) return <p className="muted md-empty">Nothing written yet.</p>
  return <div className="md" onClick={click} dangerouslySetInnerHTML={{ __html: html }} />
}

function Editor({ id, index, refs, onSaved, onDelete, onBack, onRef }: {
  id: number
  index: NotesIndex
  refs: RefLookup
  onSaved: (n: Note) => void
  onDelete: () => void
  onBack: () => void
  onRef: (kind: RefKind, id: number) => void
}) {
  const [draft, setDraft] = useState<Note | null>(null)
  const [mode, setMode] = useState<'write' | 'preview'>('preview')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [picker, setPicker] = useState<{
    start: number; query: string; x: number; y: number; line: number; above: boolean; active: number
  } | null>(null)
  const pending = useRef<NotePatch>({})
  const timer = useRef<number | undefined>(undefined)
  const body = useRef<HTMLTextAreaElement>(null)
  const preview = useDeferredValue(draft?.body ?? '')
  const [modeRef, pill] = useSlidingPill<HTMLDivElement>(`${mode}-${!!draft}`)

  useEffect(() => {
    api.note(id).then(n => { setDraft(n); setMode(n.body.trim() ? 'preview' : 'write') })
  }, [id])

  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    const patch = pending.current
    pending.current = {}
    if (!Object.keys(patch).length) return
    setStatus('saving')
    try {
      onSaved(await api.updateNote(id, patch))
      setStatus('saved')
    } catch {
      pending.current = { ...patch, ...pending.current } // keep it for the next attempt
      setStatus('error')
    }
  }, [id, onSaved])

  // save whatever is pending when switching notes, leaving the page, or hiding the tab
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && void flush()
    document.addEventListener('visibilitychange', onHide)
    return () => { document.removeEventListener('visibilitychange', onHide); void flush() }
  }, [flush])

  // grow the textarea with its content; measuring collapses it for a moment, so put the pane's scroll back after
  useLayoutEffect(() => {
    const el = body.current
    if (!el) return
    const pane = el.parentElement!, scrolled = pane.scrollTop
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
    pane.scrollTop = scrolled
    if (document.activeElement === el) keepCaretVisible(el)
  }, [draft?.body, mode])

  const candidates = useMemo<Candidate[]>(() => {
    if (!picker) return []
    const words = picker.query.toLowerCase().split(/\s+/).filter(Boolean)
    const hit = (c: Candidate) => words.every(w => `${c.label} ${c.hint}`.toLowerCase().includes(w))
    const subjects = new Map(index.subjects.map(s => [s.id, s]))
    const notes = index.notes.filter(n => n.id !== id).map<Candidate>(n => {
      const s = subjects.get(n.subject_id)!
      return { kind: 'note', id: n.id, label: n.title || 'Untitled', hint: `${s.name} · ${shortDate(n.note_date)}`, color: s.color }
    })
    const lectures = index.subjects.map<Candidate>(s =>
      ({ kind: 'lecture', id: s.id, label: s.name, hint: `Lecture · ${s.semester}`, color: s.color }))
    return [...notes.filter(hit).slice(0, 8), ...lectures.filter(hit).slice(0, 4)]
  }, [picker, index, id])

  if (!draft) return <div className="editor" />

  function change(patch: NotePatch) {
    setDraft(d => d && { ...d, ...patch })
    pending.current = { ...pending.current, ...patch }
    setStatus('idle')
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flush(), SAVE_DELAY)
  }

  // typing [[ opens the reference picker; it follows the text typed after it
  function syncPicker(el: HTMLTextAreaElement) {
    const m = /\[\[([^\]\n|[]{0,40})$/.exec(el.value.slice(0, el.selectionStart))
    if (!m || el.selectionStart !== el.selectionEnd) return setPicker(null)
    const start = el.selectionStart - m[0].length
    const { x, y } = caretXY(el, start), line = parseFloat(getComputedStyle(el).lineHeight) || 24
    // open upwards when the caret is near the bottom of the visible text and there is more room above
    const pane = el.parentElement!, below = pane.scrollTop + pane.clientHeight - y, above = y - line - pane.scrollTop
    setPicker(p => ({ start, query: m[1], x, y, line, above: below < 220 && above > below,
                      active: p?.start === start ? p.active : 0 }))
  }

  function insertRef(c: Candidate) {
    const el = body.current
    if (!el || !picker || !draft) return
    const text = `[[${c.kind}:${c.id}|${c.label.replace(/[\]|\n]/g, ' ')}]]`
    change({ body: draft.body.slice(0, picker.start) + text + draft.body.slice(el.selectionStart) })
    setPicker(null)
    const caret = picker.start + text.length
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(caret, caret) })
  }

  function startRef() {
    const el = body.current
    if (!el || !draft) return
    const at = el.selectionStart
    change({ body: draft.body.slice(0, at) + '[[' + draft.body.slice(el.selectionEnd) })
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(at + 2, at + 2); syncPicker(el) })
  }

  // wrap the selection (or nothing) in a ``` fence and put the caret where the language goes
  function insertCode() {
    const el = body.current
    if (!el || !draft) return
    const before = draft.body.slice(0, el.selectionStart), code = draft.body.slice(el.selectionStart, el.selectionEnd)
    const after = draft.body.slice(el.selectionEnd)
    const lead = before && !before.endsWith('\n') ? '\n' : ''
    const block = `${lead}\`\`\`\n${code}${code && !code.endsWith('\n') ? '\n' : ''}\`\`\`${after.startsWith('\n') ? '' : '\n'}`
    change({ body: before + block + after })
    const caret = before.length + lead.length + 3
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(caret, caret) })
  }

  function onBodyKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Tab indents inside a code block; elsewhere it keeps moving focus as usual
    if (!picker && e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey
        && inFence(e.currentTarget.value, e.currentTarget.selectionStart)) {
      e.preventDefault()
      // insertText keeps the browser's undo history; it fires onChange like typing does
      if (!document.execCommand('insertText', false, '    ')) {
        const el = e.currentTarget, at = el.selectionStart
        change({ body: el.value.slice(0, at) + '    ' + el.value.slice(el.selectionEnd) })
        requestAnimationFrame(() => el.setSelectionRange(at + 4, at + 4))
      }
      return
    }
    if (!picker) return
    const n = candidates.length
    if (e.key === 'Escape') setPicker(null)
    else if (n && e.key === 'ArrowDown') setPicker({ ...picker, active: (picker.active + 1) % n })
    else if (n && e.key === 'ArrowUp') setPicker({ ...picker, active: (picker.active - 1 + n) % n })
    else if (n && (e.key === 'Enter' || e.key === 'Tab')) insertRef(candidates[Math.min(picker.active, n - 1)])
    else return
    e.preventDefault()
  }

  // Ctrl/Cmd+E switches between writing and the rendered note
  function onEditorKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
      e.preventDefault()
      setMode(m => (m === 'write' ? 'preview' : 'write'))
    }
  }

  const semesters = [...new Map(index.subjects.map(s => [s.semester_id, s.semester]))]
  const backlinks = draft.backlinks.map(b => index.notes.find(n => n.id === b)).filter(Boolean) as NoteSummary[]
  const statusText = { idle: '', saving: 'Saving…', saved: 'Saved', error: "Couldn't save. Retrying when you type." }[status]

  return (
    <article className="editor note-editor" onKeyDown={onEditorKey}>
      <div className="editor-bar">
        <button className="link back" onClick={() => { void flush(); onBack() }}><ArrowLeft size={15} /> Notes</button>
        <input type="date" className="date-input" value={draft.note_date} aria-label="Lecture date"
               onChange={e => e.target.value && change({ note_date: e.target.value })} />
        <select className="date-input lecture-select" value={draft.subject_id} aria-label="Lecture"
                onChange={e => change({ subject_id: Number(e.target.value) })}>
          {semesters.map(([sid, name]) => (
            <optgroup key={sid} label={name}>
              {index.subjects.filter(s => s.semester_id === sid).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </optgroup>
          ))}
        </select>
        <div className="seg note-mode" ref={modeRef} role="radiogroup" aria-label="Mode">
          <span className="seg-pill" style={pill} />
          <button role="radio" aria-checked={mode === 'write'} className="seg-btn" data-active={mode === 'write'}
                  title="Write (Ctrl+E)" aria-label="Write" onClick={() => setMode('write')}><PenLine size={14} /><span className="mode-label">Write</span></button>
          <button role="radio" aria-checked={mode === 'preview'} className="seg-btn" data-active={mode === 'preview'}
                  title="Preview (Ctrl+E)" aria-label="Preview" onClick={() => setMode('preview')}><Eye size={14} /><span className="mode-label">Preview</span></button>
        </div>
        <span className={'save-status ' + status} role="status">{statusText}</span>
        <button className="icon-round" aria-label="Export as Markdown" title="Export as .md"
                onClick={() => void flush().then(() => api.exportNote(id)).catch(err => alert(`Export failed: ${err.message}`))}>
          <FileDown size={16} />
        </button>
        <button className="btn danger icon-only" aria-label="Delete note" title="Delete note"
                onClick={() => { if (!confirm('Delete this note?')) return; pending.current = {}; clearTimeout(timer.current); onDelete() }}>
          <Trash2 size={15} />
        </button>
      </div>

      <input className="entry-title" value={draft.title} placeholder="Untitled" aria-label="Title" maxLength={300}
             autoFocus={!draft.title && !draft.body} onChange={e => change({ title: e.target.value })} />
      <p className="muted small note-meta">{shortDate(draft.note_date)} · {refs.lecture(draft.subject_id)?.label}</p>

      {mode === 'write' && (
        <div className="note-hints muted small">
          <span>Markdown · <code>$x^2$</code> inline · <code>$$…$$</code> display · <code>```python</code> code · <code>[[</code> reference</span>
          <span className="note-tools">
            <button className="link" onClick={insertCode} title="Code block (wraps the selection)"><Code size={14} /> Code</button>
            <button className="link" onClick={startRef}><Link2 size={14} /> Reference</button>
          </span>
        </div>
      )}
      <div className={'note-panes ' + mode}>
        {mode === 'write' && (
          <div className="note-write">
            <textarea ref={body} className="entry-body note-body" value={draft.body} rows={12} aria-label="Note"
                      spellCheck={false} placeholder={'## Topic\n\nNotes with $\\LaTeX$, e.g. $$\\int_0^1 x^2\\,dx = \\tfrac13$$'}
                      onChange={e => { change({ body: e.target.value }); syncPicker(e.target) }}
                      onClick={e => syncPicker(e.currentTarget)} onKeyDown={onBodyKey}
                      onSelect={e => keepCaretVisible(e.currentTarget)}
                      onBlur={() => setPicker(null)} />
            {picker && (
              <ul className={'ref-picker' + (picker.above ? ' above' : '')} role="listbox" aria-label="Reference"
                  style={{ top: picker.above ? picker.y - picker.line - 4 : picker.y + 4,
                           left: `max(0px, min(${picker.x}px, 100% - 300px))` }}>
                {candidates.length ? candidates.map((c, i) => (
                  <li key={c.kind + c.id} role="option" aria-selected={i === picker.active}
                      className={`c-${c.color}` + (i === picker.active ? ' active' : '')}
                      onMouseDown={e => { e.preventDefault(); insertRef(c) }}>
                    <span className="ref-dot" />
                    <span className="ref-text"><b>{c.label}</b><small>{c.hint}</small></span>
                  </li>
                )) : <li className="muted ref-none">No note or lecture matches “{picker.query}”</li>}
              </ul>
            )}
          </div>
        )}
        <div className="note-preview">
          <Preview source={mode === 'write' ? preview : draft.body} refs={refs} onRef={onRef} />
          {backlinks.length > 0 && (
            <section className="backlinks">
              <h3>Referenced in</h3>
              {backlinks.map(n => (
                <button key={n.id} className="link" onClick={() => onRef('note', n.id)}>
                  {n.title || 'Untitled'} <span className="muted">· {refs.note(n.id)?.hint}</span>
                </button>
              ))}
            </section>
          )}
        </div>
      </div>
    </article>
  )
}

/** Lecture notes of a semester: list on the left, the open note on the right. */
export default function Notes({ semester, onSemester, onTasks }: {
  semester: Semester
  onSemester: (id: number) => void
  onTasks: () => void
}) {
  const [index, setIndex] = useState<NotesIndex | null>(null)
  const [lecture, setLecture] = useState<number | null>(() => Number(localStorage.getItem('maki_notes_lecture')) || null)
  const [selected, setSelected] = useState<number | null>(() => Number(localStorage.getItem('maki_note')) || null)
  const refs = useLookup(index)

  useEffect(() => { api.notes().then(setIndex) }, [])
  useEffect(() => { localStorage.setItem('maki_notes_lecture', String(lecture ?? '')) }, [lecture])
  useEffect(() => { localStorage.setItem('maki_note', String(selected ?? '')) }, [selected])
  // new notes land at the bottom of the list: keep the open one in view
  useEffect(() => { document.querySelector('.notes .entry-item.active')?.scrollIntoView({ block: 'nearest' }) }, [selected, !!index])

  const onSaved = useCallback((n: Note) => {
    setIndex(ix => ix && { ...ix, notes: ix.notes.map(x => (x.id === n.id ? summary(n) : x)) })
  }, [])

  if (!index) return <div className="loading">Loading…</div>

  const subjects = index.subjects.filter(s => s.semester_id === semester.id)
  const subjectOf = new Map(index.subjects.map(s => [s.id, s]))
  const lectureId = subjects.some(s => s.id === lecture) ? lecture : null
  const inSemester = index.notes.filter(n => subjectOf.get(n.subject_id)?.semester_id === semester.id)
  const shown = inSemester.filter(n => lectureId === null || n.subject_id === lectureId)
    .sort((a, b) => a.note_date.localeCompare(b.note_date) || a.id - b.id) // oldest first, like the lectures happened
  const current = inSemester.find(n => n.id === selected)
  const months: [string, NoteSummary[]][] = []
  for (const n of shown) {
    const m = monthLabel(n.note_date)
    if (months.at(-1)?.[0] !== m) months.push([m, []])
    months.at(-1)![1].push(n)
  }

  // follow a reference, switching semester when it points elsewhere
  function openRef(kind: RefKind, id: number) {
    const s = kind === 'note' ? subjectOf.get(index!.notes.find(n => n.id === id)?.subject_id ?? -1) : subjectOf.get(id)
    if (!s) return
    if (s.semester_id !== semester.id) onSemester(s.semester_id)
    if (kind === 'note') {
      if (lectureId !== null && lectureId !== s.id) setLecture(null)
      setSelected(id)
    } else {
      setLecture(id); setSelected(null)
    }
  }

  async function create() {
    const n = await api.addNote(lectureId ?? shown.at(-1)?.subject_id ?? subjects[0].id, today())
    setIndex(ix => ix && { ...ix, notes: [summary(n), ...ix.notes] })
    setSelected(n.id)
  }
  async function remove(id: number) {
    await api.deleteNote(id)
    setIndex(ix => ix && { ...ix, notes: ix.notes.filter(n => n.id !== id) })
    setSelected(null)
  }

  if (!subjects.length) {
    return (
      <div className="empty">
        <p>Notes belong to a lecture. Add the lectures of {semester.name} in Tasks first.</p>
        <button className="btn-primary" onClick={onTasks}>Go to Tasks</button>
      </div>
    )
  }

  return (
    <div className="journal notes" data-view={current ? 'editor' : 'list'}>
      <aside className="journal-list">
        <div className="journal-head"><h1>Notes</h1></div>
        <div className="lecture-filter" role="radiogroup" aria-label="Lecture">
          <button role="radio" aria-checked={lectureId === null} className={'chip' + (lectureId === null ? ' on' : '')}
                  onClick={() => setLecture(null)}>All</button>
          {subjects.map(s => (
            <button key={s.id} role="radio" aria-checked={lectureId === s.id}
                    className={`chip c-${s.color}` + (lectureId === s.id ? ' on' : '')} onClick={() => setLecture(s.id)}>
              <i className="chip-dot" />{s.name}
            </button>
          ))}
        </div>
        <div className="notes-actions">
          <button className="btn-primary" onClick={create}><Plus size={15} /> New note</button>
          <button className="ghost-btn" disabled={!shown.length}
                  title={lectureId ? 'Download this lecture’s notes as .md files (zip)' : 'Download this semester’s notes as .md files (zip)'}
                  onClick={() => api.exportNotes(semester.id, lectureId ?? undefined).catch(err => alert(`Export failed: ${err.message}`))}>
            <Download size={14} /> Export
          </button>
        </div>
        {months.map(([month, list]) => (
          <section key={month} className="month">
            <h2>{month}</h2>
            {list.map(n => (
              <button key={n.id} className={'entry-item' + (n.id === selected ? ' active' : '')} onClick={() => setSelected(n.id)}>
                <span className="entry-day">{dayLabel(n.note_date)}</span>
                <span className="entry-text">
                  <span className="entry-name">{n.title || 'Untitled'}</span>
                  {lectureId === null && (
                    <span className={`entry-excerpt note-lecture c-${subjectOf.get(n.subject_id)?.color}`}>
                      <i className="chip-dot" />{subjectOf.get(n.subject_id)?.name}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </section>
        ))}
        {!shown.length && <p className="muted small empty-note">No notes yet. Start one for today's lecture.</p>}
      </aside>
      {current ? (
        <Editor key={current.id} id={current.id} index={index} refs={refs} onSaved={onSaved} onRef={openRef}
                onBack={() => setSelected(null)} onDelete={() => void remove(current.id)} />
      ) : (
        <div className="editor-empty muted">
          {shown.length ? 'Pick a note, or start a new one.' : 'Your lecture notes will show up here.'}
        </div>
      )}
    </div>
  )
}
