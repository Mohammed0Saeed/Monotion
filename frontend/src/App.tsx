import { lazy, Suspense, useCallback, useEffect, useState, type CSSProperties } from 'react'
import {
  Archive as ArchiveIcon, FlaskConical, GraduationCap, ListChecks, LogOut, Moon, NotebookPen, NotebookText, Pencil, Plus, Rocket, Sun, Trash2,
  UserRound,
} from 'lucide-react'
import { api, auth } from './api'
import Login from './Login'
import Logo from './Logo'
import InlineInput from './InlineInput'
import Group, { COLORS, NOUN, subtree, type GroupActions } from './Group'
import { useSlidingPill } from './Segmented'
import Avatar from './Avatar'
import Journal from './Journal'
import Profile from './Profile'
import Archive from './Archive'
import { resolveTheme, useTheme } from './theme'
import type { ArchiveSection, GroupData, Kind, Profile as ProfileData, Semester, Task } from './types'

type View = 'university' | 'projects' | 'personal' | 'journal' | 'profile'

/** which part of the archive opens from each tab */
const ARCHIVE_OF: Partial<Record<View, ArchiveSection>> = { university: 'university', projects: 'project', personal: 'personal' }

// markdown + KaTeX are big; only load them when notes are opened
const Notes = lazy(() => import('./Notes'))

const TABS = [
  { id: 'university', label: 'University', short: 'University', Icon: GraduationCap },
  { id: 'projects', label: 'Side Projects', short: 'Projects', Icon: Rocket },
  { id: 'personal', label: 'Personal', short: 'Personal', Icon: UserRound },
  { id: 'journal', label: 'Journal', short: 'Journal', Icon: NotebookPen, experimental: true },
] as const

/** 2 columns from iPad portrait up, 1 on phones — cards keep their column instead of reflowing like CSS columns */
function useColumnCount() {
  const query = '(min-width: 760px)'
  const [wide, setWide] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const mq = matchMedia(query)
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide ? 2 : 1
}

function Loading() {
  return <div className="loading">Loading…</div>
}

function Board({ kind, semester }: { kind: Kind; semester?: Semester }) {
  const [groups, setGroups] = useState<GroupData[] | null>(null)
  const [adding, setAdding] = useState(false)
  const isSubject = kind === 'subject'
  const columnCount = useColumnCount()

  const load = useCallback(async () => {
    setGroups(kind === 'subject' ? await api.subjects(semester!.id) : await api.projects(kind))
  }, [kind, semester?.id])

  useEffect(() => { setGroups(null); load() }, [load])

  const patchTasks = (fn: (tasks: Task[]) => Task[]) =>
    setGroups(gs => gs && gs.map(g => ({ ...g, tasks: fn(g.tasks) })))

  const actions: GroupActions = {
    async addTask(groupId, body) {
      const t = await api.addTask(body)
      setGroups(gs => gs && gs.map(g => (g.id === groupId ? { ...g, tasks: [...g.tasks, t] } : g)))
    },
    async updateTask(id, patch) {
      patchTasks(ts => ts.map(t => (t.id === id ? { ...t, ...patch } as Task : t)))
      const t = await api.updateTask(id, patch)
      patchTasks(ts => ts.map(x => (x.id === id ? t : x)))
    },
    async removeTask(id) {
      await api.deleteTask(id)
      patchTasks(ts => { const gone = subtree(ts, id); return ts.filter(t => !gone.has(t.id)) })
    },
    async updateGroup(id, patch) {
      setGroups(gs => gs && gs.map(g => (g.id === id ? { ...g, ...patch } : g)))
      await (isSubject ? api.updateSubject : api.updateProject)(id, patch)
    },
    async removeGroup(id) {
      await (isSubject ? api.deleteSubject : api.deleteProject)(id)
      setGroups(gs => gs && gs.filter(g => g.id !== id))
    },
  }

  async function createGroup(name: string) {
    const color = COLORS[(groups?.length ?? 0) % COLORS.length]
    const g = await (kind === 'subject' ? api.addSubject(semester!.id, name, color) : api.addProject(kind, name, color))
    setGroups(gs => gs && [...gs, g])
  }

  if (!groups) return <Loading />
  const noun = NOUN[kind]
  const addTile = adding ? (
    <div className="card c-gray new-group" style={{ '--i': 0 } as CSSProperties}>
      <InlineInput placeholder={{ subject: 'Subject name', project: 'Project name', personal: 'List name, e.g. Errands' }[kind]} className="group-edit"
                   onSubmit={createGroup} onClose={() => setAdding(false)} />
    </div>
  ) : (
    <button className="add-group" onClick={() => setAdding(true)}>
      <Plus size={16} /> {groups.length ? `New ${noun}` : `Add your first ${noun}`}
    </button>
  )
  // cards alternate between columns (left, right, left…); the add tile continues the pattern
  const columns = Array.from({ length: columnCount }, (_, c) => (
    <div className="column" key={c}>
      {groups.map((g, i) => i % columnCount === c &&
        <Group key={g.id} index={i} group={g} kind={kind} actions={actions} />)}
      {groups.length % columnCount === c && addTile}
    </div>
  ))
  return <div className="board" style={{ '--cols': columnCount } as CSSProperties}>{columns}</div>
}

function University() {
  const [semesters, setSemesters] = useState<Semester[] | null>(null)
  const [current, setCurrent] = useState<number | null>(() => Number(localStorage.getItem('maki_semester')) || null)
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const semester = semesters?.find(s => s.id === current) ?? semesters?.[0]
  const [segRef, pill] = useSlidingPill<HTMLDivElement>(`${semester?.id}-${renaming}-${semesters?.length}`)
  const [mode, setMode] = useState<'tasks' | 'notes'>(() => (localStorage.getItem('maki_uni_mode') === 'notes' ? 'notes' : 'tasks'))
  const [modeRef, modePill] = useSlidingPill<HTMLDivElement>(`${mode}-${!!semesters?.length}`)

  useEffect(() => { api.semesters().then(setSemesters) }, [])
  useEffect(() => { if (current) localStorage.setItem('maki_semester', String(current)) }, [current])
  useEffect(() => { localStorage.setItem('maki_uni_mode', mode) }, [mode])

  if (!semesters) return <Loading />
  const list: Semester[] = semesters

  async function addSemester(name: string) {
    const s = await api.addSemester(name)
    setSemesters([...list, s]); setCurrent(s.id)
  }
  async function renameSemester(name: string) {
    if (!semester) return
    await api.renameSemester(semester.id, name)
    setSemesters(list.map(s => (s.id === semester.id ? { ...s, name } : s)))
  }
  async function deleteSemester() {
    if (!semester) return
    if (!confirm(`Delete "${semester.name}" with all its subjects, tasks and notes?`)) return
    await api.deleteSemester(semester.id)
    const rest = list.filter(s => s.id !== semester.id)
    setSemesters(rest); setCurrent(rest[0]?.id ?? null)
  }

  const addInput = (
    <InlineInput placeholder="Semester name, e.g. Winter 25/26" className="seg-input"
                 onSubmit={name => void addSemester(name)} onClose={() => setAdding(false)} />
  )

  if (!list.length) {
    return (
      <div className="empty">
        <p>Add the semester you're in to start tracking its subjects.</p>
        {adding ? addInput : <button className="btn-primary" onClick={() => setAdding(true)}><Plus size={15} /> Add semester</button>}
      </div>
    )
  }

  return (
    <div className="uni" data-mode={mode}>
      <div className="subbar">
        <div className="seg" ref={modeRef} role="tablist" aria-label="Tasks or notes">
          <span className="seg-pill" style={modePill} />
          <button role="tab" aria-selected={mode === 'tasks'} className="seg-btn" data-active={mode === 'tasks'}
                  onClick={() => setMode('tasks')}><ListChecks size={15} /> Tasks</button>
          <button role="tab" aria-selected={mode === 'notes'} className="seg-btn" data-active={mode === 'notes'}
                  onClick={() => setMode('notes')}><NotebookText size={15} /> Notes</button>
        </div>
        <span className="subbar-sep" aria-hidden="true" />
        <div className="seg" ref={segRef} role="tablist" aria-label="Semesters">
          <span className="seg-pill" style={pill} />
          {list.map(s => (renaming && s.id === semester?.id ? (
            <InlineInput key={s.id} initial={s.name} placeholder="Semester name" className="seg-input"
                         onSubmit={name => void renameSemester(name)} onClose={() => setRenaming(false)} />
          ) : (
            <button key={s.id} role="tab" aria-selected={s.id === semester?.id} className="seg-btn"
                    data-active={s.id === semester?.id} onClick={() => setCurrent(s.id)}>{s.name}</button>
          )))}
        </div>
        {adding ? addInput : <button className="ghost-btn" onClick={() => setAdding(true)}><Plus size={14} /> Semester</button>}
        <span className="subbar-actions">
          <button className="link" onClick={() => setRenaming(true)}><Pencil size={14} /> Rename</button>
          <button className="link danger" onClick={deleteSemester}><Trash2 size={14} /> Delete</button>
        </span>
      </div>
      {mode === 'tasks'
        ? <Board key={semester!.id} kind="subject" semester={semester} />
        : <Suspense fallback={<Loading />}>
            <Notes semester={semester!} onSemester={setCurrent} onTasks={() => setMode('tasks')} />
          </Suspense>}
    </div>
  )
}

export default function App() {
  const [authed, setAuthed] = useState(!!auth.token)
  const [me, setMe] = useState<ProfileData | null>(null)
  const [theme, setTheme] = useTheme()
  const [view, setView] = useState<View>(() => (localStorage.getItem('maki_tab') as View) || 'university')
  const [tabsRef, pill] = useSlidingPill<HTMLDivElement>(`${view}-${authed}`)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [reloads, setReloads] = useState(0) // bumped when the archive put tasks back, so the board refetches

  useEffect(() => { localStorage.setItem('maki_tab', view) }, [view])
  useEffect(() => { if (authed) api.me().then(setMe) }, [authed])
  // refresh the stats whenever the profile is opened
  useEffect(() => { if (authed && view === 'profile') api.me().then(setMe) }, [authed, view])

  function logout() {
    auth.clear(); setAuthed(false); setMe(null)
  }

  if (!authed) return <Login onDone={() => setAuthed(true)} />

  const name = me?.display_name || me?.username || auth.username || ''
  const dark = resolveTheme(theme) === 'dark'

  return (
    <div className="app">
      <nav className="topbar">
        <span className="logo"><Logo /> <span className="logo-text">Monotion</span></span>
        <div className="seg tabs" ref={tabsRef} role="tablist" aria-label="Sections">
          <span className="seg-pill" style={pill} />
          {TABS.map(t => (
            <button key={t.id} role="tab" aria-selected={view === t.id} className="seg-btn" data-active={view === t.id}
                    onClick={() => setView(t.id)}>
              <t.Icon size={16} />
              <span className="tab-label">{t.label}</span>
              <span className="tab-short">{t.short}</span>
              {'experimental' in t && <FlaskConical size={12} className="tab-flag" aria-label="Experimental" />}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <button className="icon-round" aria-label="Archive" title="Archive" onClick={() => setArchiveOpen(true)}>
          <ArchiveIcon size={16} />
        </button>
        <button className="icon-round" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
                title={dark ? 'Light mode' : 'Dark mode'}
                onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setTheme(dark ? 'light' : 'dark', { x: r.left + r.width / 2, y: r.top + r.height / 2 }) }}>
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button className={'me-btn' + (view === 'profile' ? ' active' : '')} onClick={() => setView('profile')} aria-label="Profile">
          <Avatar name={name} />
          <span className="me-name">{name}</span>
        </button>
        <button className="link danger logout" onClick={logout}><LogOut size={14} /> Log out</button>
      </nav>
      <main key={`${view}-${reloads}`} className={'view-' + view}>
        {view === 'university' && <University />}
        {view === 'projects' && <Board kind="project" />}
        {view === 'personal' && <Board kind="personal" />}
        {view === 'journal' && <Journal />}
        {view === 'profile' && (me
          ? <Profile me={me} onChange={setMe} theme={theme} onTheme={setTheme} onLogout={logout} />
          : <Loading />)}
      </main>
      {archiveOpen && (
        <Archive initial={ARCHIVE_OF[view] ?? 'all'}
                 onClose={changed => { setArchiveOpen(false); if (changed) setReloads(n => n + 1) }} />
      )}
    </div>
  )
}
