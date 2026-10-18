from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Credentials(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=6, max_length=128)


class Token(BaseModel):
    access_token: str
    username: str


class NameIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    color: str | None = None


ProjectKind = Literal["project", "personal"]


class ProjectIn(NameIn):
    kind: ProjectKind = "project"


class NamePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    color: str | None = None
    position: int | None = None


class SemesterOut(ORM):
    id: int
    name: str


class TaskOut(ORM):
    id: int
    parent_id: int | None
    title: str
    notes: str
    done: bool
    collapsed: bool
    due_date: date | None
    completed_at: datetime | None
    position: int


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    subject_id: int | None = None
    project_id: int | None = None
    parent_id: int | None = None


class TaskPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    notes: str | None = None
    done: bool | None = None
    collapsed: bool | None = None
    due_date: date | None = None
    clear_due_date: bool = False
    position: int | None = None


class GroupOut(ORM):
    id: int
    name: str
    color: str
    position: int
    tasks: list[TaskOut]


ArchiveSection = Literal["university", "project", "personal"]


class ArchiveGroup(BaseModel):
    """A subject, project or list with only its archived tasks (and their sub-tasks)."""
    section: ArchiveSection
    id: int
    name: str
    color: str
    semester: str | None  # subjects only
    tasks: list[TaskOut]


class ProfileStats(BaseModel):
    semesters: int
    subjects: int
    projects: int
    personal_lists: int
    tasks: int
    tasks_done: int
    journal_entries: int


class ProfileOut(BaseModel):
    username: str
    display_name: str
    avatar: str
    avatar_source: str
    created_at: datetime
    stats: ProfileStats


class ProfilePatch(BaseModel):
    display_name: str = Field(max_length=120)


class AvatarIn(BaseModel):
    image: str = Field(max_length=20000, pattern=r"^data:image/png;base64,[A-Za-z0-9+/]+=*$")
    source: str = Field(default="", max_length=500, pattern=r"^(https://commons\.wikimedia\.org/\S*)?$")


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=128)


class PasswordConfirm(BaseModel):
    password: str


class JournalOut(ORM):
    id: int
    entry_date: date
    title: str
    body: str
    mood: int | None
    updated_at: datetime


class JournalCreate(BaseModel):
    entry_date: date | None = None
    title: str = Field(default="", max_length=300)


class JournalPatch(BaseModel):
    entry_date: date | None = None
    title: str | None = Field(default=None, max_length=300)
    body: str | None = None
    mood: int | None = Field(default=None, ge=1, le=5)
    clear_mood: bool = False


class NoteSubject(BaseModel):
    id: int
    name: str
    color: str
    semester_id: int
    semester: str


class NoteSummary(ORM):
    id: int
    subject_id: int
    note_date: date
    title: str
    updated_at: datetime


class NotesIndex(BaseModel):
    subjects: list[NoteSubject]  # every lecture of the user, for the picker and for references
    notes: list[NoteSummary]


class NoteOut(NoteSummary):
    body: str
    backlinks: list[int]  # ids of notes that reference this one


class NoteCreate(BaseModel):
    subject_id: int
    note_date: date | None = None
    title: str = Field(default="", max_length=300)


class NotePatch(BaseModel):
    subject_id: int | None = None
    note_date: date | None = None
    title: str | None = Field(default=None, max_length=300)
    body: str | None = None


IP2Stage = Literal["data", "training", "evaluation"]
IP2Status = Literal["open", "progress", "done"]


class IP2TaskOut(ORM):
    id: int
    stage: IP2Stage
    title: str
    status: IP2Status
    position: int
    updated_at: datetime


class IP2TaskCreate(BaseModel):
    stage: IP2Stage
    title: str = Field(min_length=1, max_length=500)


class IP2TaskPatch(BaseModel):
    stage: IP2Stage | None = None
    title: str | None = Field(default=None, min_length=1, max_length=500)
    status: IP2Status | None = None
