from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import current_user, hash_password, make_token, verify_password
from ..config import settings
from ..db import get_db
from ..models import JournalEntry, Project, Semester, Subject, Task, User
from ..schemas import (Credentials, PasswordChange, PasswordConfirm, ProfileOut,
                       ProfilePatch, ProfileStats, Token)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Token)
def register(body: Credentials, db: Session = Depends(get_db)):
    if not settings.allow_registration:
        raise HTTPException(403, "Registration is disabled")
    username = body.username.strip().lower()
    if db.scalar(select(User).where(User.username == username)):
        raise HTTPException(409, "Username already taken")
    user = User(username=username, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    return Token(access_token=make_token(user), username=user.username)


@router.post("/login", response_model=Token)
def login(body: Credentials, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == body.username.strip().lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Wrong username or password")
    return Token(access_token=make_token(user), username=user.username)


def profile(db: Session, user: User) -> ProfileOut:
    def count(q):
        return db.scalar(q) or 0
    tasks = select(func.count()).select_from(Task).where(Task.user_id == user.id)
    stats = ProfileStats(
        semesters=count(select(func.count()).select_from(Semester).where(Semester.user_id == user.id)),
        subjects=count(select(func.count()).select_from(Subject).join(Semester)
                       .where(Semester.user_id == user.id)),
        projects=count(select(func.count()).select_from(Project).where(Project.user_id == user.id)),
        tasks=count(tasks),
        tasks_done=count(tasks.where(Task.done.is_(True))),
        journal_entries=count(select(func.count()).select_from(JournalEntry)
                              .where(JournalEntry.user_id == user.id)),
    )
    return ProfileOut(username=user.username, display_name=user.display_name,
                      created_at=user.created_at, stats=stats)


@router.get("/me", response_model=ProfileOut)
def me(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return profile(db, user)


@router.patch("/me", response_model=ProfileOut)
def update_me(body: ProfilePatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    user.display_name = body.display_name.strip()
    db.commit()
    return profile(db, user)


@router.post("/password", status_code=204)
def change_password(body: PasswordChange, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    db.commit()


@router.post("/delete-account", status_code=204)
def delete_account(body: PasswordConfirm, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(400, "Password is incorrect")
    db.delete(user)
    db.commit()
