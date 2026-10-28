import calendar
from datetime import date, timedelta
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import Deadline, Subject, User
from ..schemas import DeadlineCreate, DeadlineOut, DeadlinePatch
from .planner import owned

router = APIRouter(prefix="/deadlines", tags=["deadlines"], dependencies=[Depends(current_user)])

DAYS = {"daily": 1, "weekly": 7, "biweekly": 14}


def add_months(d: date, n: int) -> date:
    year, month = divmod(d.month - 1 + n, 12)
    year, month = d.year + year, month + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))  # Jan 31 + 1 month = Feb 28/29


def occurrences(start: date, repeat: str, count: int) -> list[date]:
    """The dates of a series. Each is counted from the start, so a monthly one on the 31st comes back to the 31st."""
    if repeat == "none":
        return [start]
    if repeat == "monthly":
        return [add_months(start, i) for i in range(count)]
    return [start + timedelta(days=DAYS[repeat] * i) for i in range(count)]


def owned_deadline(db: Session, did: int, user: User) -> Deadline:
    d = db.get(Deadline, did)
    if d is None or d.user_id != user.id:
        raise HTTPException(404, "Not found")
    return d


@router.get("", response_model=list[DeadlineOut])
def list_deadlines(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return db.scalars(select(Deadline).where(Deadline.user_id == user.id)
                      .order_by(Deadline.due_date, Deadline.id)).all()


@router.post("", response_model=list[DeadlineOut])
def create_deadline(body: DeadlineCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if body.subject_id is not None:
        owned(db, Subject, body.subject_id, user)
    try:
        dates = occurrences(body.due_date, body.repeat, body.count)
    except (OverflowError, ValueError):
        raise HTTPException(422, "The series runs past the last supported date")
    series = uuid4().hex if len(dates) > 1 else None
    rows = [Deadline(user_id=user.id, subject_id=body.subject_id, title=body.title.strip(), due_date=d,
                     series_id=series, occurrence=i, series_total=len(dates))
            for i, d in enumerate(dates, 1)]
    db.add_all(rows)
    db.commit()
    return rows


@router.patch("/{did}", response_model=DeadlineOut)
def update_deadline(did: int, body: DeadlinePatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    d = owned_deadline(db, did, user)
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(d, k, v.strip() if k == "title" else v)
    db.commit()
    return d


@router.delete("/{did}", status_code=204)
def delete_deadline(did: int, series: bool = False, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Delete one occurrence, or with ?series=true every occurrence of its repeat."""
    d = owned_deadline(db, did, user)
    if series and d.series_id:
        for x in db.scalars(select(Deadline).where(Deadline.user_id == user.id, Deadline.series_id == d.series_id)):
            db.delete(x)
    else:
        db.delete(d)
    db.commit()
