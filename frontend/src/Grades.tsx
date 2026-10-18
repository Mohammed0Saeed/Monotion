import { useEffect, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { ListChecks, Plus, X } from 'lucide-react'
import { api } from './api'
import { EXAM_TYPES, fmtCredits, fmtGrade, gradeWord, hasExamDate, isFailed, isPassed, MODULE_TYPES, RESULTS, summarize } from './gpa'
import type { Grade, GradePatch, GroupData, Semester } from './types'

/** on phones each field shows its own label; from tablet up the header row names the columns */
function Cell({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return <label className={'gcell ' + className}><span className="gcell-label">{label}</span>{children}</label>
}

const blurOnEnter = (revert: () => void) => (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur()
  if (e.key === 'Escape') { revert(); requestAnimationFrame(() => (e.target as HTMLInputElement).blur()) }
}

function Row({ grade, subjects, index, onUpdate, onRemove }: {
  grade: Grade; subjects: GroupData[]; index: number; onUpdate: (patch: GradePatch) => void; onRemove: () => void
}) {
  const [credits, setCredits] = useState(fmtCredits(grade.credits))
  useEffect(() => setCredits(fmtCredits(grade.credits)), [grade.credits])
  const subject = subjects.find(s => s.id === grade.subject_id)
  function commitCredits() {
    const n = Math.round(Number(credits.replace(',', '.')) * 2) / 2 // credit points come in halves
    if (!(n > 0 && n <= 99)) return setCredits(fmtCredits(grade.credits))
    setCredits(fmtCredits(n))
    if (n !== grade.credits) onUpdate({ credits: n })
  }

  const status = isPassed(grade) ? 'passed' : isFailed(grade) ? 'failed' : 'pending'
  return (
    <div className="grade-row" data-status={status} role="row" style={{ '--i': index } as CSSProperties}>
      <Cell label="Module" className={`g-module c-${subject?.color ?? 'gray'}`}>
        <span className="chip-dot" />
        <select className="gfield" value={grade.subject_id} onChange={e => onUpdate({ subject_id: Number(e.target.value) })}>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
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
        {!hasExamDate(grade.exam_type)
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
      <button className="g-delete danger" aria-label={`Delete ${subject?.name ?? 'exam'}`} title="Delete"
              onClick={() => confirm(`Delete the exam of "${subject?.name ?? 'this module'}"?`) && onRemove()}>
        <X size={15} />
      </button>
    </div>
  )
}

/** exams of the selected semester: module, type, exam, date, credit points and grade, with the semester's GPA on top */
export default function Grades({ semester, onTasks }: { semester: Semester; onTasks: () => void }) {
  const [grades, setGrades] = useState<Grade[] | null>(null)
  const [subjects, setSubjects] = useState<GroupData[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setGrades(null); setSubjects(null)
    api.grades(semester.id).then(setGrades)
    api.subjects(semester.id).then(setSubjects)
  }, [semester.id])

  if (!grades || !subjects) return <div className="loading">Loading…</div>

  if (!subjects.length) {
    return (
      <div className="empty">
        <p>Modules are the subjects of this semester. Add them under Tasks, then give each one its exam here.</p>
        <button className="btn-primary" onClick={onTasks}><ListChecks size={15} /> Go to Tasks</button>
      </div>
    )
  }

  async function add(subjectId: number) {
    try {
      const g = await api.addGrade(subjectId)
      setGrades(gs => gs && [...gs, g])
    } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }
  async function update(id: number, patch: GradePatch) {
    setError('')
    setGrades(gs => gs && gs.map(g => {
      if (g.id !== id) return g
      const next = { ...g, ...patch }
      if (patch.clear_exam_date || !hasExamDate(next.exam_type)) next.exam_date = null
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
  const open = subjects.filter(s => !grades.some(g => g.subject_id === s.id))
  const listed = subjects.filter(s => grades.some(g => g.subject_id === s.id))

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
          <Row key={g.id} grade={g} subjects={subjects} index={i} onUpdate={p => void update(g.id, p)} onRemove={() => void remove(g.id)} />
        ))}
        <label className="grade-add">
          <Plus size={15} />
          {/* picking a subject adds its exam; the select snaps back so the next one can be picked */}
          <select className="gfield" value="" aria-label="Add the exam of a module"
                  onChange={e => e.target.value && void add(Number(e.target.value))}>
            <option value="" disabled>{grades.length ? 'Add a module…' : 'Add the exam of a module…'}</option>
            {open.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            {listed.length > 0 && (
              <optgroup label="Already listed: add a retake">
                {listed.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </optgroup>
            )}
          </select>
        </label>
      </div>
      {error && <p className="note error" role="status">{error}</p>}
      <p className="muted small grade-hint">
        German GPA: grades weighted by credit points, cut after the first decimal. Failed attempts and ungraded
        (pass/fail) modules don't count toward it; passed ungraded modules still earn their credits. A retake is a new row.
      </p>
    </div>
  )
}
