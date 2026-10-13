import { useState, type CSSProperties } from 'react'
import { ChevronRight, Plus, Trash2, X } from 'lucide-react'
import InlineInput from './InlineInput'
import type { GroupData, GroupPatch, Kind, Task, TaskCreate, TaskPatch } from './types'

export const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'brown', 'purple', 'pink', 'gray'] as const

const LEAVE_MS = 180

type Tree = Record<number, Task[]>

function buildTree(tasks: Task[]): Tree {
  const byParent: Tree = {}
  for (const t of tasks) (byParent[t.parent_id ?? 0] ||= []).push(t)
  return byParent
}

interface TaskActions {
  update: (id: number, patch: TaskPatch) => void
  remove: (id: number) => void
  add: (body: TaskCreate) => void
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} aria-label={label} />
      <span className="box" />
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>
    </label>
  )
}

function TaskRow({ task, byParent, depth, actions }: { task: Task; byParent: Tree; depth: number; actions: TaskActions }) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const kids = byParent[task.id] ?? []
  const hasKids = kids.length > 0 || adding
  const open = !task.collapsed

  function remove() {
    setLeaving(true)
    setTimeout(() => actions.remove(task.id), LEAVE_MS)
  }

  return (
    <div className={'task-node' + (leaving ? ' leaving' : '')}>
      <div className="node-inner">
        <div className={'task' + (task.done ? ' done' : '')} style={{ '--depth': depth } as CSSProperties}>
          {hasKids ? (
            <button className={'toggle' + (open ? ' open' : '')} aria-expanded={open}
                    aria-label={open ? 'Collapse sub-tasks' : 'Expand sub-tasks'}
                    onClick={() => actions.update(task.id, { collapsed: open })}>
              <ChevronRight size={15} />
            </button>
          ) : <span className="toggle" aria-hidden="true" />}
          <Check checked={task.done} label={task.title} onChange={done => actions.update(task.id, { done })} />
          {editing ? (
            <InlineInput initial={task.title} placeholder="Task title" className="title-edit"
                         onSubmit={title => actions.update(task.id, { title })} onClose={() => setEditing(false)} />
          ) : (
            <span className="task-title" role="button" tabIndex={0} title="Click to edit"
                  onClick={() => setEditing(true)} onKeyDown={e => e.key === 'Enter' && setEditing(true)}>
              <span>{task.title}</span>
            </span>
          )}
          <span className="row-actions">
            <button title="Add sub-task" aria-label="Add sub-task"
                    onClick={() => { setAdding(true); if (!open) actions.update(task.id, { collapsed: false }) }}>
              <Plus size={15} />
            </button>
            <button className="danger" title="Delete task" aria-label="Delete task" onClick={remove}><X size={15} /></button>
          </span>
        </div>
        {hasKids && (
          <div className={'kids' + (open ? ' open' : '')}>
            <div className="kids-inner">
              {kids.map(k => <TaskRow key={k.id} task={k} byParent={byParent} depth={depth + 1} actions={actions} />)}
              {adding && (
                <div className="task adding" style={{ '--depth': depth + 1 } as CSSProperties}>
                  <InlineInput placeholder="Sub-task title" keepOpen onClose={() => setAdding(false)}
                               onSubmit={title => actions.add({ title, parent_id: task.id })} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export interface GroupActions {
  addTask: (groupId: number, body: TaskCreate) => Promise<void>
  updateTask: (id: number, patch: TaskPatch) => Promise<void>
  removeTask: (id: number) => Promise<void>
  updateGroup: (id: number, patch: GroupPatch) => Promise<void>
  removeGroup: (id: number) => Promise<void>
}

export default function Group({ group, actions, kind, index }: {
  group: GroupData; actions: GroupActions; kind: Kind; index: number
}) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [menu, setMenu] = useState(false)
  const byParent = buildTree(group.tasks)
  const total = group.tasks.length
  const done = group.tasks.filter(t => t.done).length
  const rootKey = kind === 'subject' ? 'subject_id' : 'project_id'

  const taskActions: TaskActions = {
    update: (id, patch) => void actions.updateTask(id, patch),
    remove: id => void actions.removeTask(id),
    add: body => void actions.addTask(group.id, body),
  }

  return (
    <section className={`card c-${group.color}`} style={{ '--i': index } as CSSProperties}>
      <header>
        <button className="dot" onClick={() => setMenu(!menu)} aria-label="Change color" aria-expanded={menu} />
        {editing ? (
          <InlineInput initial={group.name} placeholder="Name" className="group-edit"
                       onSubmit={name => void actions.updateGroup(group.id, { name })} onClose={() => setEditing(false)} />
        ) : (
          <h2 tabIndex={0} title="Click to rename" onClick={() => setEditing(true)}
              onKeyDown={e => e.key === 'Enter' && setEditing(true)}>{group.name}</h2>
        )}
        {total > 0 && <span className="count" title={`${done} of ${total} done`}>{done}/{total}</span>}
        <button className="new-btn" onClick={() => setAdding(true)}><Plus size={14} /> New</button>
        <button className="icon-btn danger" title={`Delete ${kind}`} aria-label={`Delete ${group.name}`}
                onClick={() => confirm(`Delete "${group.name}" and all its tasks${kind === 'subject' ? ' and notes' : ''}?`) && void actions.removeGroup(group.id)}>
          <Trash2 size={15} />
        </button>
      </header>
      {menu && (
        <div className="swatches">
          {COLORS.map((c, i) => (
            <button key={c} className={`swatch c-${c}` + (c === group.color ? ' current' : '')}
                    style={{ '--i': i } as CSSProperties} aria-label={c}
                    onClick={() => { void actions.updateGroup(group.id, { color: c }); setMenu(false) }} />
          ))}
        </div>
      )}
      <div className="tasks">
        {(byParent[0] ?? []).map(t => <TaskRow key={t.id} task={t} byParent={byParent} depth={0} actions={taskActions} />)}
        {adding && (
          <div className="task adding" style={{ '--depth': 0 } as CSSProperties}>
            <InlineInput placeholder="Task title" keepOpen onClose={() => setAdding(false)}
                         onSubmit={title => taskActions.add({ title, [rootKey]: group.id })} />
          </div>
        )}
        <button className="add-row" onClick={() => setAdding(true)}><Plus size={15} /> New task</button>
      </div>
      {total > 0 && (
        <div className={'rail' + (done === total ? ' complete' : '')} aria-hidden="true">
          <span style={{ '--p': done / total } as CSSProperties} />
        </div>
      )}
    </section>
  )
}
