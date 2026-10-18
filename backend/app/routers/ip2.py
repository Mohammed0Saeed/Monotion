from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import IP2Task, User
from ..schemas import IP2TaskCreate, IP2TaskOut, IP2TaskPatch

router = APIRouter(prefix="/ip2", tags=["ip2"])


def owned_task(db: Session, tid: int, user: User) -> IP2Task:
    t = db.get(IP2Task, tid)
    if t is None or t.user_id != user.id:
        raise HTTPException(404, "Not found")
    return t


@router.get("", response_model=list[IP2TaskOut])
def list_tasks(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return db.scalars(select(IP2Task).where(IP2Task.user_id == user.id)
                      .order_by(IP2Task.position, IP2Task.id)).all()


@router.post("", response_model=IP2TaskOut)
def create_task(body: IP2TaskCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    pos = db.scalar(select(func.coalesce(func.max(IP2Task.position), -1) + 1)
                    .where(IP2Task.user_id == user.id, IP2Task.stage == body.stage))
    t = IP2Task(user_id=user.id, stage=body.stage, title=body.title.strip(), status="open", position=pos)
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@router.patch("/{tid}", response_model=IP2TaskOut)
def update_task(tid: int, body: IP2TaskPatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    t = owned_task(db, tid, user)
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(t, k, v.strip() if k == "title" else v)
    db.commit()
    db.refresh(t)
    return t


@router.delete("/{tid}", status_code=204)
def delete_task(tid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    db.delete(owned_task(db, tid, user))
    db.commit()
