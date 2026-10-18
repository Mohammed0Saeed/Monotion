from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import Grade, Semester, User
from ..schemas import GradeCreate, GradeOut, GradePatch

router = APIRouter(tags=["grades"])

ORDER = (Grade.exam_date.asc().nulls_last(), Grade.id)


def owned_grade(db: Session, gid: int, user: User) -> Grade:
    g = db.get(Grade, gid)
    if g is None or g.user_id != user.id:
        raise HTTPException(404, "Not found")
    return g


def owned_semester(db: Session, sid: int, user: User) -> Semester:
    s = db.get(Semester, sid)
    if s is None or s.user_id != user.id:
        raise HTTPException(404, "Not found")
    return s


@router.get("/grades", response_model=list[GradeOut])
def all_grades(db: Session = Depends(get_db), user: User = Depends(current_user)):
    """every exam of the user, for the GPA in the profile"""
    return db.scalars(select(Grade).where(Grade.user_id == user.id).order_by(*ORDER)).all()


@router.get("/semesters/{sid}/grades", response_model=list[GradeOut])
def semester_grades(sid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    owned_semester(db, sid, user)
    return db.scalars(select(Grade).where(Grade.semester_id == sid).order_by(*ORDER)).all()


@router.post("/grades", response_model=GradeOut)
def create_grade(body: GradeCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    owned_semester(db, body.semester_id, user)
    data = body.model_dump()
    data["module"] = data["module"].strip()
    if data["exam_type"] == "submission":
        data["exam_date"] = None
    g = Grade(user_id=user.id, **data)
    db.add(g)
    db.commit()
    db.refresh(g)
    return g


@router.patch("/grades/{gid}", response_model=GradeOut)
def update_grade(gid: int, body: GradePatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    g = owned_grade(db, gid, user)
    data = body.model_dump(exclude_unset=True)
    if data.pop("clear_exam_date", False):
        g.exam_date = None
    for k, v in data.items():
        if v is not None:
            setattr(g, k, v.strip() if k == "module" else v)
    if g.exam_type == "submission":  # a submission has a deadline, not an exam date
        g.exam_date = None
    db.commit()
    db.refresh(g)
    return g


@router.delete("/grades/{gid}", status_code=204)
def delete_grade(gid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    db.delete(owned_grade(db, gid, user))
    db.commit()
