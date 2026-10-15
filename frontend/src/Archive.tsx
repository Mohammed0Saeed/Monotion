import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArchiveRestore, X } from 'lucide-react'
import { api } from './api'
import { Check, subtree } from './Group'
import type { ArchiveGroup, ArchiveSection, Task } from './types'

type Filter = ArchiveSection | 'all'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'university', label: 'University' },
  { id: 'project', label: 'Side Projects' },
  { id: 'personal', label: 'Personal' },
]

const doneOn = (t: Task) =>
  t.completed_at && new Date(t.completed_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

function Branch({ task, tasks, depth }: { task: Task; tasks: Task[]; depth: number }) {
  return (
    <>
      <div className={'task' + (task.done ? ' done' : '')} style={{ '--depth': depth } as CSSProperties}>
        <Check checked={task.done} label={task.title} disabled />
        <span className="task-title"><span>{task.title}</span></span>
      </div>
      {tasks.filter(k => k.parent_id === task.id)
        .map(k => <Branch key={k.id} task={k} tasks={tasks} depth={depth + 1} />)}
    </>
  )
}

/** Tasks done for more than 2 days, with their sub-tasks; restoring one un-ticks it and puts it back on its board. */
export default function Archive({ initial, onClose }: { initial: Filter; onClose: (changed: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [groups, setGroups] = useState<ArchiveGroup[] | null>(null)
  const [filter, setFilter] = useState<Filter>(initial)
  const changed = useRef(false)

  useEffect(() => {
    ref.current?.showModal()
    api.archive().then(setGroups)
  }, [])

  function drop(id: number) {
    changed.current = true
    setGroups(gs => gs && gs
      .map(g => { const gone = subtree(g.tasks, id); return { ...g, tasks: g.tasks.filter(t => !gone.has(t.id)) } })
      .filter(g => g.tasks.length))
  }
  async function restore(t: Task) {
    await api.updateTask(t.id, { done: false })
    drop(t.id)
  }
  async function remove(t: Task) {
    if (!confirm(`Delete "${t.title}" for good?`)) return
    await api.deleteTask(t.id)
    drop(t.id)
  }

  const count = (f: Filter) => (groups ?? []).filter(g => f === 'all' || g.section === f)
    .reduce((n, g) => n + g.tasks.filter(t => t.parent_id === null).length, 0)
  const shown = (groups ?? []).filter(g => filter === 'all' || g.section === filter)

  return (
    <dialog ref={ref} className="archive" aria-labelledby="archive-title"
            onClose={() => onClose(changed.current)}
            onClick={e => e.target === e.currentTarget && ref.current?.close()}>
      <div className="archive-inner">
        <header className="archive-head">
          <h1 id="archive-title">Archive</h1>
          <span className="spacer" />
          <button className="icon-round" aria-label="Close archive" title="Close" onClick={() => ref.current?.close()}>
            <X size={18} />
          </button>
        </header>
        <p className="muted small archive-hint">Tasks you've finished move here 2 days after you tick them off.</p>
        <div className="lecture-filter" role="radiogroup" aria-label="Section">
          {FILTERS.map(f => (
            <button key={f.id} role="radio" aria-checked={filter === f.id} className={'chip' + (filter === f.id ? ' on' : '')}
                    onClick={() => setFilter(f.id)}>
              {f.label}{groups && <span className="chip-count">{count(f.id)}</span>}
            </button>
          ))}
        </div>

        <div className="archive-body">
          {!groups ? <div className="loading">Loading…</div>
            : !shown.length ? <p className="muted archive-empty">Nothing archived{filter === 'all' ? ' yet' : ' here'}.</p>
            : shown.map((g, i) => (
              <section key={g.section + g.id} className={`archive-group c-${g.color}`} style={{ '--i': i } as CSSProperties}>
                <h2><span className="chip-dot" />{g.name}{g.semester && <span className="muted"> · {g.semester}</span>}</h2>
                {g.tasks.filter(t => t.parent_id === null)
                  .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
                  .map(t => (
                    <div key={t.id} className="archive-item">
                      <div className="archive-row">
                        <div className="archive-tree"><Branch task={t} tasks={g.tasks} depth={0} /></div>
                        <span className="archive-when">{doneOn(t)}</span>
                        <span className="archive-actions">
                          <button className="link" title="Put back on its board, not done" onClick={() => void restore(t)}>
                            <ArchiveRestore size={14} /> Restore
                          </button>
                          <button className="link danger" aria-label={`Delete ${t.title}`} title="Delete"
                                  onClick={() => void remove(t)}>
                            <X size={15} />
                          </button>
                        </span>
                      </div>
                    </div>
                  ))}
              </section>
            ))}
        </div>
      </div>
    </dialog>
  )
}
