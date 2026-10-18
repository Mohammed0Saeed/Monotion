import type {
  ArchiveGroup, GroupData, GroupPatch, IP2Patch, IP2Stage, IP2Task, JournalEntry, JournalPatch, Note, NotePatch, NotesIndex, Profile, ProjectKind, Semester, Task,
  TaskCreate, TaskPatch, TokenResponse,
} from './types'

const KEY = 'maki_token'

export const auth = {
  get token() { return localStorage.getItem(KEY) },
  set(token: string, username: string) { localStorage.setItem(KEY, token); localStorage.setItem('maki_user', username) },
  clear() { localStorage.removeItem(KEY); localStorage.removeItem('maki_user') },
  get username() { return localStorage.getItem('maki_user') },
}

async function request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch('/api' + path, {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(auth.token && { Authorization: `Bearer ${auth.token}` }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401 && path !== '/auth/login' && path !== '/auth/register') {
    auth.clear()
    window.location.reload()
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const detail = Array.isArray(err.detail) ? err.detail.map((d: { msg: string }) => d.msg).join(', ') : err.detail
    throw new Error(detail || res.statusText)
  }
  return (res.status === 204 ? null : await res.json()) as T
}

/** fetch a file (with the auth header, so a plain link won't do) and hand it to the browser as a download */
async function download(path: string) {
  const res = await fetch('/api' + path, { headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {} })
  if (!res.ok) throw new Error(res.statusText)
  const name = /filename\*=UTF-8''([^;]+)/.exec(res.headers.get('Content-Disposition') ?? '')?.[1]
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: name ? decodeURIComponent(name) : 'notes' })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const api = {
  login: (u: string, p: string) => request<TokenResponse>('POST', '/auth/login', { username: u, password: p }),
  register: (u: string, p: string) => request<TokenResponse>('POST', '/auth/register', { username: u, password: p }),

  me: () => request<Profile>('GET', '/auth/me'),
  updateMe: (display_name: string) => request<Profile>('PATCH', '/auth/me', { display_name }),
  setAvatar: (image: string, source: string) => request<Profile>('PUT', '/auth/me/avatar', { image, source }),
  clearAvatar: () => request<Profile>('DELETE', '/auth/me/avatar'),
  changePassword: (current_password: string, new_password: string) =>
    request('POST', '/auth/password', { current_password, new_password }),
  deleteAccount: (password: string) => request('POST', '/auth/delete-account', { password }),

  semesters: () => request<Semester[]>('GET', '/semesters'),
  addSemester: (name: string) => request<Semester>('POST', '/semesters', { name }),
  renameSemester: (id: number, name: string) => request('PATCH', `/semesters/${id}`, { name }),
  deleteSemester: (id: number) => request('DELETE', `/semesters/${id}`),

  subjects: (sid: number) => request<GroupData[]>('GET', `/semesters/${sid}/subjects`),
  addSubject: (sid: number, name: string, color: string) => request<GroupData>('POST', `/semesters/${sid}/subjects`, { name, color }),
  updateSubject: (id: number, patch: GroupPatch) => request('PATCH', `/subjects/${id}`, patch),
  deleteSubject: (id: number) => request('DELETE', `/subjects/${id}`),

  projects: (kind: ProjectKind) => request<GroupData[]>('GET', `/projects?kind=${kind}`),
  addProject: (kind: ProjectKind, name: string, color: string) => request<GroupData>('POST', '/projects', { kind, name, color }),
  updateProject: (id: number, patch: GroupPatch) => request('PATCH', `/projects/${id}`, patch),
  deleteProject: (id: number) => request('DELETE', `/projects/${id}`),

  addTask: (body: TaskCreate) => request<Task>('POST', '/tasks', body),
  updateTask: (id: number, patch: TaskPatch) => request<Task>('PATCH', `/tasks/${id}`, patch),
  deleteTask: (id: number) => request('DELETE', `/tasks/${id}`),
  archive: () => request<ArchiveGroup[]>('GET', '/archive'),

  journal: () => request<JournalEntry[]>('GET', '/journal'),
  addJournal: (entry_date?: string) => request<JournalEntry>('POST', '/journal', { entry_date }),
  updateJournal: (id: number, patch: JournalPatch) => request<JournalEntry>('PATCH', `/journal/${id}`, patch),
  deleteJournal: (id: number) => request('DELETE', `/journal/${id}`),

  ip2: () => request<IP2Task[]>('GET', '/ip2'),
  addIP2: (stage: IP2Stage, title: string) => request<IP2Task>('POST', '/ip2', { stage, title }),
  updateIP2: (id: number, patch: IP2Patch) => request<IP2Task>('PATCH', `/ip2/${id}`, patch),
  deleteIP2: (id: number) => request('DELETE', `/ip2/${id}`),

  notes: () => request<NotesIndex>('GET', '/notes'),
  note: (id: number) => request<Note>('GET', `/notes/${id}`),
  addNote: (subject_id: number, note_date: string) => request<Note>('POST', '/notes', { subject_id, note_date }),
  updateNote: (id: number, patch: NotePatch) => request<Note>('PATCH', `/notes/${id}`, patch),
  deleteNote: (id: number) => request('DELETE', `/notes/${id}`),
  exportNote: (id: number) => download(`/notes/${id}/export`),
  exportNotes: (semesterId: number, subjectId?: number) =>
    download(`/semesters/${semesterId}/notes/export${subjectId ? `?subject_id=${subjectId}` : ''}`),
}
