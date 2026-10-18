from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import Grade, Semester, Subject, User
from ..schemas import NO_EXAM_DATE, GradeCreate, GradeOut, GradePatch

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


def owned_subject(db: Session, sid: int, user: User) -> Subject:
    s = db.get(Subject, sid)
    if s is None:
        raise HTTPException(404, "Subject not found")
    owned_semester(db, s.semester_id, user)
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
    subject = owned_subject(db, body.subject_id, user)
    data = body.model_dump()
    if data["exam_type"] in NO_EXAM_DATE:
        data["exam_date"] = None
    g = Grade(user_id=user.id, semester_id=subject.semester_id, **data)
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
    if data.get("subject_id") is not None and owned_subject(db, data["subject_id"], user).semester_id != g.semester_id:
        raise HTTPException(400, "Pick a subject of the same semester")
    for k, v in data.items():
        if v is not None:
            setattr(g, k, v)
    if g.exam_type in NO_EXAM_DATE:  # submissions and labs aren't formal exams
        g.exam_date = None
    db.commit()
    db.refresh(g)
    return g


@router.delete("/grades/{gid}", status_code=204)
def delete_grade(gid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    db.delete(owned_grade(db, gid, user))
    db.commit()
