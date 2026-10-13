export interface Task {
  id: number
  parent_id: number | null
  title: string
  notes: string
  done: boolean
  collapsed: boolean
  due_date: string | null
  position: number
}

export interface GroupData {
  id: number
  name: string
  color: string
  position: number
  tasks: Task[]
}

export interface Semester {
  id: number
  name: string
}

export interface TokenResponse {
  access_token: string
  username: string
}

export type Kind = 'subject' | 'project'
export type TaskPatch = Partial<Pick<Task, 'title' | 'notes' | 'done' | 'collapsed' | 'due_date'>> & { clear_due_date?: boolean }
export type GroupPatch = Partial<Pick<GroupData, 'name' | 'color' | 'position'>>
export interface TaskCreate {
  title: string
  subject_id?: number
  project_id?: number
  parent_id?: number
}

export interface Profile {
  username: string
  display_name: string
  created_at: string
  stats: {
    semesters: number
    subjects: number
    projects: number
    tasks: number
    tasks_done: number
    journal_entries: number
  }
}

export interface JournalEntry {
  id: number
  entry_date: string
  title: string
  body: string
  mood: number | null
  updated_at: string
}

export type JournalPatch = Partial<Pick<JournalEntry, 'entry_date' | 'title' | 'body' | 'mood'>> & { clear_mood?: boolean }

export interface NoteSubject {
  id: number
  name: string
  color: string
  semester_id: number
  semester: string
}

export interface NoteSummary {
  id: number
  subject_id: number
  note_date: string
  title: string
  updated_at: string
}

export interface Note extends NoteSummary {
  body: string
  backlinks: number[]   // notes that reference this one
}

export interface NotesIndex {
  subjects: NoteSubject[]
  notes: NoteSummary[]
}

export type NotePatch = Partial<Pick<Note, 'subject_id' | 'note_date' | 'title' | 'body'>>
