from datetime import date, datetime

from sqlalchemy import (Boolean, CheckConstraint, Date, DateTime, ForeignKey,
                        Integer, Numeric, String, Text, func)
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(128))
    display_name: Mapped[str] = mapped_column(String(120), default="", server_default="")
    avatar_seed: Mapped[str] = mapped_column(String(32), default="", server_default="")  # pixel pet; "" shows the initial
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Semester(Base):
    __tablename__ = "semesters"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    position: Mapped[int] = mapped_column(Integer, default=0)


class Subject(Base):
    __tablename__ = "subjects"
    id: Mapped[int] = mapped_column(primary_key=True)
    semester_id: Mapped[int] = mapped_column(ForeignKey("semesters.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    color: Mapped[str] = mapped_column(String(16), default="blue")
    position: Mapped[int] = mapped_column(Integer, default=0)


class Project(Base):
    """A side project, or a list of personal tasks (kind="personal"); both hold tasks the same way."""
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16), default="project", server_default="project")
    name: Mapped[str] = mapped_column(String(200))
    color: Mapped[str] = mapped_column(String(16), default="purple")
    position: Mapped[int] = mapped_column(Integer, default=0)


class Task(Base):
    """A task belongs to exactly one subject or one project; sub-tasks point at a parent task."""
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint("(subject_id IS NULL) <> (project_id IS NULL)", name="task_one_container"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    subject_id: Mapped[int | None] = mapped_column(ForeignKey("subjects.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(500))
    notes: Mapped[str] = mapped_column(Text, default="")
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    collapsed: Mapped[bool] = mapped_column(Boolean, default=False)
    due_date: Mapped[date | None] = mapped_column(Date)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)  # set when checked; drives the archive
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Deadline(Base):
    """A dated deadline. A repeating one is stored as one row per occurrence, tied together by series_id."""
    __tablename__ = "deadlines"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    subject_id: Mapped[int | None] = mapped_column(ForeignKey("subjects.id", ondelete="SET NULL"), index=True)
    title: Mapped[str] = mapped_column(String(300))
    due_date: Mapped[date] = mapped_column(Date, index=True)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    series_id: Mapped[str | None] = mapped_column(String(32), index=True)  # shared by the occurrences of one repeat
    occurrence: Mapped[int] = mapped_column(Integer, default=1)            # 1-based position in the series
    series_total: Mapped[int] = mapped_column(Integer, default=1)          # how many the series was created with
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class JournalEntry(Base):
    __tablename__ = "journal_entries"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    entry_date: Mapped[date] = mapped_column(Date, index=True)
    title: Mapped[str] = mapped_column(String(300), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    mood: Mapped[int | None] = mapped_column(Integer)  # 1 (rough) .. 5 (great)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class LectureNote(Base):
    """Notes from a lecture: markdown with $LaTeX$ and [[note:id|…]] / [[lecture:id|…]] references."""
    __tablename__ = "lecture_notes"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id", ondelete="CASCADE"), index=True)
    note_date: Mapped[date] = mapped_column(Date, index=True)
    title: Mapped[str] = mapped_column(String(300), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())



class IP2Task(Base):
    """A task of the IP robotics project, in one stage column (data, training, evaluation)."""
    __tablename__ = "ip2_tasks"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    stage: Mapped[str] = mapped_column(String(16))                # data | training | evaluation
    title: Mapped[str] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(16), default="open")  # open | progress | done
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class Grade(Base):
    """An exam of one module (a subject, like lecture notes), with its credit points and result."""
    __tablename__ = "grades"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    semester_id: Mapped[int] = mapped_column(ForeignKey("semesters.id", ondelete="CASCADE"), index=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id", ondelete="CASCADE"), index=True)
    module_type: Mapped[str] = mapped_column(String(16), default="mandatory")  # mandatory | subelective | elective | general
    exam_type: Mapped[str] = mapped_column(String(16), default="written")      # written | oral | submission | lab
    exam_date: Mapped[date | None] = mapped_column(Date)                       # formal exams only
    # "pending", a German grade "1.0".."5.0", or "passed" / "failed" for ungraded modules
    result: Mapped[str] = mapped_column(String(8), default="pending")
    credits: Mapped[float] = mapped_column(Numeric(4, 1, asdecimal=False), default=5)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
