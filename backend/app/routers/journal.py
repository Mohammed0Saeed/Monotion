from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import JournalEntry, User
from ..schemas import JournalCreate, JournalOut, JournalPatch

router = APIRouter(prefix="/journal", tags=["journal"])


def owned_entry(db: Session, eid: int, user: User) -> JournalEntry:
    e = db.get(JournalEntry, eid)
    if e is None or e.user_id != user.id:
        raise HTTPException(404, "Not found")
    return e


@router.get("", response_model=list[JournalOut])
def list_entries(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return db.scalars(select(JournalEntry).where(JournalEntry.user_id == user.id)
                      .order_by(JournalEntry.entry_date.desc(), JournalEntry.id.desc())).all()


@router.post("", response_model=JournalOut)
def create_entry(body: JournalCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    e = JournalEntry(user_id=user.id, entry_date=body.entry_date or date.today(), title=body.title, body="")
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


@router.patch("/{eid}", response_model=JournalOut)
def update_entry(eid: int, body: JournalPatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    e = owned_entry(db, eid, user)
    data = body.model_dump(exclude_unset=True)
    if data.pop("clear_mood", False):
        e.mood = None
    for k, v in data.items():
        if v is not None:
            setattr(e, k, v)
    db.commit()
    db.refresh(e)
    return e


@router.delete("/{eid}", status_code=204)
def delete_entry(eid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    db.delete(owned_entry(db, eid, user))
    db.commit()
