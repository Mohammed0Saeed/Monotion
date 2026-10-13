from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import Project, Semester, Subject, Task, User
from ..schemas import (GroupOut, NameIn, NamePatch, SemesterOut, TaskCreate,
                       TaskOut, TaskPatch)

router = APIRouter(tags=["planner"], dependencies=[Depends(current_user)])


# ---------- helpers ----------
def owned(db: Session, model, id_: int, user: User):
    """Fetch a row that belongs to the user (directly or via its parent) or 404."""
    obj = db.get(model, id_)
    if obj is None:
        raise HTTPException(404, "Not found")
    if model is Subject:
        ok = db.get(Semester, obj.semester_id).user_id == user.id
    else:
        ok = obj.user_id == user.id
    if not ok:
        raise HTTPException(404, "Not found")
    return obj


def next_pos(db: Session, model, **filters) -> int:
    q = select(func.coalesce(func.max(model.position), -1) + 1)
    for k, v in filters.items():
        q = q.where(getattr(model, k) == v)
    return db.scalar(q)


def apply_patch(obj, body: NamePatch):
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(obj, k, v)


def groups_out(db: Session, groups: list, key: str, user: User) -> list[GroupOut]:
    ids = [g.id for g in groups]
    tasks = db.scalars(
        select(Task).where(getattr(Task, key).in_(ids)).order_by(Task.position, Task.id)
    ).all() if ids else []
    by_group: dict[int, list] = {}
    for t in tasks:
        by_group.setdefault(getattr(t, key), []).append(t)
    return [
        GroupOut(id=g.id, name=g.name, color=g.color, position=g.position,
                 tasks=[TaskOut.model_validate(t) for t in by_group.get(g.id, [])])
        for g in groups
    ]


# ---------- semesters ----------
@router.get("/semesters", response_model=list[SemesterOut])
def list_semesters(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return db.scalars(select(Semester).where(Semester.user_id == user.id)
                      .order_by(Semester.position, Semester.id)).all()


@router.post("/semesters", response_model=SemesterOut)
def create_semester(body: NameIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    s = Semester(user_id=user.id, name=body.name, position=next_pos(db, Semester, user_id=user.id))
    db.add(s)
    db.commit()
    return s


@router.patch("/semesters/{sid}", response_model=SemesterOut)
def update_semester(sid: int, body: NamePatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    s = owned(db, Semester, sid, user)
    apply_patch(s, body)
    db.commit()
    return s


@router.delete("/semesters/{sid}", status_code=204)
def delete_semester(sid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    db.delete(owned(db, Semester, sid, user))
    db.commit()


# ---------- subjects ----------
@router.get("/semesters/{sid}/subjects", response_model=list[GroupOut])
def semester_board(sid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    owned(db, Semester, sid, user)
    subjects = db.scalars(select(Subject).where(Subject.semester_id == sid)
                          .order_by(Subject.position, Subject.id)).all()
    return groups_out(db, subjects, "subject_id", user)


@router.post("/semesters/{sid}/subjects", response_model=GroupOut)
def create_subject(sid: int, body: NameIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    owned(db, Semester, sid, user)
    s = Subject(semester_id=sid, name=body.name, color=body.color or "blue",
                position=next_pos(db, Subject, semester_id=sid))
    db.add(s)
    db.commit()
    return GroupOut(id=s.id, name=s.name, color=s.color, position=s.position, tasks=[])


@router.patch("/subjects/{id_}")
def update_subject(id_: int, body: NamePatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    s = owned(db, Subject, id_, user)
    apply_patch(s, body)
    db.commit()
    return {"id": s.id, "name": s.name, "color": s.color, "position": s.position}


@router.delete("/subjects/{id_}", status_code=204)
def delete_subject(id_: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    db.delete(owned(db, Subject, id_, user))
    db.commit()


# ---------- projects ----------
@router.get("/projects", response_model=list[GroupOut])
def list_projects(db: Session = Depends(get_db), user: User = Depends(current_user)):
    projects = db.scalars(select(Project).where(Project.user_id == user.id)
                          .order_by(Project.position, Project.id)).all()
    return groups_out(db, projects, "project_id", user)


@router.post("/projects", response_model=GroupOut)
def create_project(body: NameIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = Project(user_id=user.id, name=body.name, color=body.color or "purple",
                position=next_pos(db, Project, user_id=user.id))
    db.add(p)
    db.commit()
    return GroupOut(id=p.id, name=p.name, color=p.color, position=p.position, tasks=[])


@router.patch("/projects/{id_}")
def update_project(id_: int, body: NamePatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = owned(db, Project, id_, user)
    apply_patch(p, body)
    db.commit()
    return {"id": p.id, "name": p.name, "color": p.color, "position": p.position}


@router.delete("/projects/{id_}", status_code=204)
def delete_project(id_: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    db.delete(owned(db, Project, id_, user))
    db.commit()


# ---------- tasks ----------
@router.post("/tasks", response_model=TaskOut)
def create_task(body: TaskCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    subject_id, project_id = body.subject_id, body.project_id
    if body.parent_id is not None:
        parent = owned(db, Task, body.parent_id, user)
        subject_id, project_id = parent.subject_id, parent.project_id
    elif (subject_id is None) == (project_id is None):
        raise HTTPException(422, "Provide exactly one of subject_id, project_id, or parent_id")
    if subject_id is not None:
        owned(db, Subject, subject_id, user)
    if project_id is not None:
        owned(db, Project, project_id, user)
    t = Task(user_id=user.id, title=body.title, subject_id=subject_id, project_id=project_id,
             parent_id=body.parent_id,
             position=next_pos(db, Task, subject_id=subject_id, project_id=project_id,
                               parent_id=body.parent_id))
    db.add(t)
    db.commit()
    return t


@router.patch("/tasks/{tid}", response_model=TaskOut)
def update_task(tid: int, body: TaskPatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    t = owned(db, Task, tid, user)
    data = body.model_dump(exclude_unset=True)
    if data.pop("clear_due_date", False):
        t.due_date = None
    for k, v in data.items():
        if v is not None:
            setattr(t, k, v)
    db.commit()
    return t


@router.delete("/tasks/{tid}", status_code=204)
def delete_task(tid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    db.delete(owned(db, Task, tid, user))
    db.commit()
