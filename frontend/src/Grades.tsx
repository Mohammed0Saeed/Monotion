import { useEffect, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import { api } from './api'
import { EXAM_TYPES, fmtCredits, fmtGrade, gradeWord, isFailed, isPassed, MODULE_TYPES, RESULTS, summarize } from './gpa'
import type { Grade, GradePatch, Semester } from './types'

/** on phones each field shows its own label; from tablet up the header row names the columns */
function Cell({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return <label className={'gcell ' + className}><span className="gcell-label">{label}</span>{children}</label>
}

const blurOnEnter = (revert: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur()
  if (e.key === 'Escape') { revert(); requestAnimationFrame(() => (e.target as HTMLInputElement).blur()) }
}

function Row({ grade, index, onUpdate, onRemove }: {
  grade: Grade; index: number; onUpdate: (patch: GradePatch) => void; onRemove: () => void
}) {
  const [module, setModule] = useState(grade.module)
  const [credits, setCredits] = useState(fmtCredits(grade.credits))
  useEffect(() => setModule(grade.module), [grade.module])
  useEffect(() => setCredits(fmtCredits(grade.credits)), [grade.credits])

  function commitModule() {
    const v = module.trim()
    if (!v) return setModule(grade.module)
    if (v !== grade.module) onUpdate({ module: v })
  }
  function commitCredits() {
    const n = Math.round(Number(credits.replace(',', '.')) * 2) / 2 // credit points come in halves
    if (!(n > 0 && n <= 99)) return setCredits(fmtCredits(grade.credits))
    setCredits(fmtCredits(n))
    if (n !== grade.credits) onUpdate({ credits: n })
  }

  const status = isPassed(grade) ? 'passed' : isFailed(grade) ? 'failed' : 'pending'
  return (
    <div className="grade-row" data-status={status} role="row" style={{ '--i': index } as CSSProperties}>
      <Cell label="Module" className="g-module">
        <input className="gfield" value={module} maxLength={200} onChange={e => setModule(e.target.value)}
               onBlur={commitModule} onKeyDown={blurOnEnter(() => setModule(grade.module))} />
      </Cell>
      <Cell label="Module type" className="g-type">
        <select className="gfield" value={grade.module_type}
                onChange={e => onUpdate({ module_type: e.target.value as Grade['module_type'] })}>
          {MODULE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </Cell>
      <Cell label="Exam" className="g-exam">
        <select className="gfield" value={grade.exam_type}
                onChange={e => onUpdate({ exam_type: e.target.value as Grade['exam_type'] })}>
          {EXAM_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </Cell>
      <Cell label="Exam date" className="g-date">
        {grade.exam_type === 'submission'
          ? <span className="gfield g-nodate">No exam date</span>
          : <input type="date" className="gfield" value={grade.exam_date ?? ''}
                   onChange={e => onUpdate(e.target.value ? { exam_date: e.target.value } : { clear_exam_date: true })} />}
      </Cell>
      <Cell label="Credits" className="g-credits">
        <span className="g-credits-box">
          <input className="gfield" inputMode="decimal" value={credits} onChange={e => setCredits(e.target.value)}
                 onBlur={commitCredits} onKeyDown={blurOnEnter(() => setCredits(fmtCredits(grade.credits)))} />
          <span className="g-unit">CP</span>
        </span>
      </Cell>
      <Cell label="Grade" className="g-result">
        <select className="gfield" value={grade.result}
                onChange={e => onUpdate({ result: e.target.value as Grade['result'] })}>
          {RESULTS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </Cell>
      <button className="g-delete danger" aria-label={`Delete ${grade.module}`} title="Delete"
              onClick={() => confirm(`Delete the exam of "${grade.module}"?`) && onRemove()}>
        <X size={15} />
      </button>
    </div>
  )
}

/** exams of the selected semester: module, type, exam, date, credit points and grade, with the semester's GPA on top */
export default function Grades({ semester }: { semester: Semester }) {
  const [grades, setGrades] = useState<Grade[] | null>(null)
  const [subjects, setSubjects] = useState<string[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setGrades(null)
    api.grades(semester.id).then(setGrades)
    api.subjects(semester.id).then(gs => setSubjects(gs.map(g => g.name))).catch(() => {})
  }, [semester.id])

  if (!grades) return <div className="loading">Loading…</div>

  async function add(e: FormEvent) {
    e.preventDefault()
    const module = name.trim()
    if (!module) return
    setName('')
    try {
      const g = await api.addGrade(semester.id, module)
      setGrades(gs => gs && [...gs, g])
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }
  async function update(id: number, patch: GradePatch) {
    setError('')
    setGrades(gs => gs && gs.map(g => {
      if (g.id !== id) return g
      const next = { ...g, ...patch }
      if (patch.clear_exam_date || next.exam_type === 'submission') next.exam_date = null
      delete (next as GradePatch).clear_exam_date
      return next
    }))
    try {
      const saved = await api.updateGrade(id, patch)
      setGrades(gs => gs && gs.map(g => (g.id === id ? saved : g)))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      api.grades(semester.id).then(setGrades) // put back what's stored
    }
  }
  async function remove(id: number) {
    await api.deleteGrade(id)
    setGrades(gs => gs && gs.filter(g => g.id !== id))
  }

  const sum = summarize(grades)
  const suggestions = subjects.filter(s => !grades.some(g => g.module === s))

  return (
    <div className="grades">
      <dl className="grade-stats">
        <div className="tile">
          <dt>Semester GPA</dt>
          <dd><strong>{fmtGrade(sum.gpaOfficial)}</strong>{sum.gpaOfficial !== null && <span>{gradeWord(sum.gpaOfficial)}</span>}</dd>
          <dd className="tile-note">{sum.gpa === null ? 'No graded modules yet' : `exactly ${fmtGrade(sum.gpa, 2)}, from ${sum.graded} graded`}</dd>
        </div>
        <div className="tile">
          <dt>Credits earned</dt>
          <dd><strong>{fmtCredits(sum.credits)}</strong><span>CP</span></dd>
          <dd className="tile-note">{sum.pendingCredits ? `${fmtCredits(sum.pendingCredits)} CP waiting for a grade` : 'Nothing waiting for a grade'}</dd>
        </div>
        <div className="tile">
          <dt>Modules passed</dt>
          <dd><strong>{sum.passed}</strong><span>of {grades.length}</span></dd>
          <dd className="tile-note">{grades.filter(isFailed).length ? `${grades.filter(isFailed).length} failed` : 'None failed'}</dd>
        </div>
      </dl>

      <div className="grade-table" role="table" aria-label={`Exams in ${semester.name}`}>
        <div className="grade-head" role="row">
          <span>Module</span><span>Type</span><span>Exam</span><span>Date</span><span>Credits</span><span>Grade</span><span />
        </div>
        {grades.map((g, i) => (
          <Row key={g.id} grade={g} index={i} onUpdate={p => void update(g.id, p)} onRemove={() => void remove(g.id)} />
        ))}
        <form className="grade-add" onSubmit={add}>
          <Plus size={15} />
          <input className="gfield" value={name} list="grade-modules" maxLength={200} onChange={e => setName(e.target.value)}
                 placeholder={grades.length ? 'Add a module…' : 'Add your first module, e.g. Linear Algebra'} aria-label="New module" />
          <datalist id="grade-modules">{suggestions.map(s => <option key={s} value={s} />)}</datalist>
          {name.trim() && <button className="new-btn">Add</button>}
        </form>
      </div>
      {error && <p className="note error" role="status">{error}</p>}
      <p className="muted small grade-hint">
        German GPA: grades weighted by credit points, cut after the first decimal. Failed attempts and ungraded
        (pass/fail) modules don't count toward it; passed ungraded modules still earn their credits. A retake is a new row.
      </p>
    </div>
  )
}
