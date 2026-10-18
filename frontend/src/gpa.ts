import type { ExamType, Grade, GradeResult, ModuleType } from './types'

export const MODULE_TYPES: { id: ModuleType; label: string }[] = [
  { id: 'mandatory', label: 'Mandatory' },
  { id: 'subelective', label: 'Sub-elective' },
  { id: 'elective', label: 'Elective' },
  { id: 'general', label: 'General' },
]

export const EXAM_TYPES: { id: ExamType; label: string }[] = [
  { id: 'written', label: 'Written exam' },
  { id: 'oral', label: 'Oral exam' },
  { id: 'submission', label: 'Submission' },
  { id: 'lab', label: 'Lab' },
]

/** only formal exams have an exam date; submissions and labs don't */
export const hasExamDate = (t: ExamType) => t === 'written' || t === 'oral'

export const RESULTS: { id: GradeResult; label: string }[] = [
  { id: 'pending', label: 'Not graded yet' },
  ...(['1.0', '1.3', '1.7', '2.0', '2.3', '2.7', '3.0', '3.3', '3.7', '4.0'] as const).map(id => ({ id, label: id })),
  { id: '5.0', label: '5.0 (failed)' },
  { id: 'passed', label: 'Passed (ungraded)' },
  { id: 'failed', label: 'Failed (ungraded)' },
]

const isGrade = (r: GradeResult) => /^\d\.\d$/.test(r)
const tenths = (n: number) => Math.round(n * 10)

export const isPassed = (g: Grade) => g.result === 'passed' || (isGrade(g.result) && Number(g.result) <= 4)
export const isFailed = (g: Grade) => g.result === 'failed' || g.result === '5.0'

export interface Summary {
  gpa: number | null        // credit-weighted average, exact
  gpaOfficial: number | null // cut after the first decimal, as German exam regulations do (1.86 → 1.8)
  credits: number           // credit points of passed modules, graded or not
  pendingCredits: number
  passed: number            // modules passed
  graded: number            // of those, with a grade (the ones in the GPA)
}

/** German GPA: average of passed graded modules weighted by credit points; failed attempts and ungraded modules don't count.
 *  Sums run in integer tenths so the cut-off isn't thrown by float error (1.8 must not become 1.7999…). */
export function summarize(grades: Grade[]): Summary {
  let num = 0, den = 0, credits = 0, pending = 0, passed = 0, graded = 0
  for (const g of grades) {
    if (g.result === 'pending') pending += tenths(g.credits)
    if (!isPassed(g)) continue
    passed++
    credits += tenths(g.credits)
    if (isGrade(g.result)) {
      graded++
      num += tenths(Number(g.result)) * tenths(g.credits)
      den += tenths(g.credits)
    }
  }
  return {
    gpa: den ? num / den / 10 : null,
    gpaOfficial: den ? Math.floor(num / den) / 10 : null,
    credits: credits / 10,
    pendingCredits: pending / 10,
    passed, graded,
  }
}

/** the German word for a final grade */
export function gradeWord(gpa: number) {
  if (gpa <= 1.5) return 'sehr gut'
  if (gpa <= 2.5) return 'gut'
  if (gpa <= 3.5) return 'befriedigend'
  return 'ausreichend'
}

export const fmtGrade = (n: number | null, digits = 1) => (n === null ? '–' : n.toFixed(digits))
export const fmtCredits = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
