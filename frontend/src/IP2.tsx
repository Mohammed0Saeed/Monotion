import { useEffect, useState, type CSSProperties } from 'react'
import { BrainCircuit, ChartColumn, Circle, CircleCheck, CircleDashed, Database, Plus, X } from 'lucide-react'
import { api } from './api'
import InlineInput from './InlineInput'
import type { IP2Patch, IP2Stage, IP2Status, IP2Task } from './types'

const STAGES: { id: IP2Stage; label: string; color: string; Icon: typeof Database }[] = [
  { id: 'data', label: 'Data collection', color: 'blue', Icon: Database },
  { id: 'training', label: 'Training', color: 'orange', Icon: BrainCircuit },
  { id: 'evaluation', label: 'Evaluation', color: 'green', Icon: ChartColumn },
]

const STATUSES: { id: IP2Status; label: string; Icon: typeof Circle }[] = [
  { id: 'open', label: 'Open', Icon: Circle },
  { id: 'progress', label: 'In progress', Icon: CircleDashed },
  { id: 'done', label: 'Done', Icon: CircleCheck },
]
const NEXT: Record<IP2Status, IP2Status> = { open: 'progress', progress: 'done', done: 'open' }
/** running work first, then what's left, finished last */
const ORDER: Record<IP2Status, number> = { progress: 0, open: 1, done: 2 }

const LEAVE_MS = 180

function Row({ task, onUpdate, onRemove }: {
  task: IP2Task; onUpdate: (patch: IP2Patch) => void; onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const status = STATUSES.find(s => s.id === task.status)!
  const next = STATUSES.find(s => s.id === NEXT[task.status])!

  return (
    <div className={'task-node' + (leaving ? ' leaving' : '')}>
      <div className="node-inner">
        <div className={'task ip2-task' + (task.status === 'done' ? ' done' : '')}>
          {editing ? (
            <InlineInput initial={task.title} placeholder="Task title" className="title-edit"
                         onSubmit={title => onUpdate({ title })} onClose={() => setEditing(false)} />
          ) : (
            <span className="task-title" role="button" tabIndex={0} title="Click to edit"
                  onClick={() => setEditing(true)} onKeyDown={e => e.key === 'Enter' && setEditing(true)}>
              <span>{task.title}</span>
            </span>
          )}
          <button className="ip2-status" data-status={task.status} title={`Mark as ${next.label.toLowerCase()}`}
                  aria-label={`${status.label}. Mark as ${next.label.toLowerCase()}`}
                  onClick={() => onUpdate({ status: next.id })}>
            <status.Icon size={13} /> <span>{status.label}</span>
          </button>
          <span className="row-actions">
            <button className="danger" title="Delete task" aria-label="Delete task"
                    onClick={() => { setLeaving(true); setTimeout(onRemove, LEAVE_MS) }}>
              <X size={15} />
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}

function Column({ stage, index, tasks, onAdd, onUpdate, onRemove }: {
  stage: (typeof STAGES)[number]
  index: number
  tasks: IP2Task[]
  onAdd: (title: string) => void
  onUpdate: (id: number, patch: IP2Patch) => void
  onRemove: (id: number) => void
}) {
  const [adding, setAdding] = useState(false)
  const sorted = [...tasks].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.position - b.position)
  const done = tasks.filter(t => t.status === 'done').length

  return (
    <section className={`card ip2-col c-${stage.color}`} style={{ '--i': index } as CSSProperties}>
      <header>
        <stage.Icon size={18} className="ip2-icon" />
        <h2>{stage.label}</h2>
        {tasks.length > 0 && <span className="count" title={`${done} of ${tasks.length} done`}>{done}/{tasks.length}</span>}
        <button className="new-btn" onClick={() => setAdding(true)}><Plus size={14} /> New</button>
      </header>
      <div className="ip2-tally">
        {STATUSES.map(s => (
          <span key={s.id} data-status={s.id}><s.Icon size={12} /> {tasks.filter(t => t.status === s.id).length} {s.label.toLowerCase()}</span>
        ))}
      </div>
      <div className="tasks">
        {sorted.map(t => (
          <Row key={t.id} task={t} onUpdate={patch => onUpdate(t.id, patch)} onRemove={() => onRemove(t.id)} />
        ))}
        {adding && (
          <div className="task adding ip2-adding">
            <InlineInput placeholder="Task title" keepOpen onSubmit={onAdd} onClose={() => setAdding(false)} />
          </div>
        )}
        <button className="add-row ip2-add" onClick={() => setAdding(true)}><Plus size={15} /> New task</button>
      </div>
      {tasks.length > 0 && (
        <div className={'rail' + (done === tasks.length ? ' complete' : '')} aria-hidden="true">
          <span style={{ '--p': done / tasks.length } as CSSProperties} />
        </div>
      )}
    </section>
  )
}

/** IP robotics project: data collection → training → evaluation, each task open, in progress or done */
export default function IP2() {
  const [tasks, setTasks] = useState<IP2Task[] | null>(null)

  useEffect(() => { api.ip2().then(setTasks) }, [])

  if (!tasks) return <div className="loading">Loading…</div>

  async function add(stage: IP2Stage, title: string) {
    const t = await api.addIP2(stage, title)
    setTasks(ts => ts && [...ts, t])
  }
  async function update(id: number, patch: IP2Patch) {
    setTasks(ts => ts && ts.map(t => (t.id === id ? { ...t, ...patch } : t)))
    const t = await api.updateIP2(id, patch)
    setTasks(ts => ts && ts.map(x => (x.id === id ? t : x)))
  }
  async function remove(id: number) {
    await api.deleteIP2(id)
    setTasks(ts => ts && ts.filter(t => t.id !== id))
  }

  return (
    <div className="ip2">
      <div className="ip2-head">
        <h1>IP2</h1>
        <p className="muted small">Robotics experiments: collect data, train, evaluate. Click a task's status to move it along.</p>
      </div>
      <div className="ip2-board">
        {STAGES.map((s, i) => (
          <Column key={s.id} stage={s} index={i} tasks={tasks.filter(t => t.stage === s.id)}
                  onAdd={title => void add(s.id, title)} onUpdate={(id, p) => void update(id, p)}
                  onRemove={id => void remove(id)} />
        ))}
      </div>
    </div>
  )
}
