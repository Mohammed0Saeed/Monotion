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


DeadlineRepeat = Literal["none", "daily", "weekly", "biweekly", "monthly"]
MAX_REPEATS = 100


class DeadlineCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    due_date: date
    subject_id: int | None = None
    repeat: DeadlineRepeat = "none"
    count: int = Field(default=1, ge=1, le=MAX_REPEATS)  # occurrences in all, the first included


class DeadlinePatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    due_date: date | None = None
    done: bool | None = None


class DeadlineOut(ORM):
    id: int
    subject_id: int | None
    title: str
    due_date: date
    done: bool
    series_id: str | None
    occurrence: int
    series_total: int


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
    avatar_seed: str
    created_at: datetime
    stats: ProfileStats


class ProfilePatch(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    avatar_seed: str | None = Field(default=None, pattern=r"^[\w-]{0,32}$")  # "" goes back to the initial


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


ModuleType = Literal["mandatory", "subelective", "elective", "general"]
ExamType = Literal["written", "oral", "submission", "lab"]
NO_EXAM_DATE = {"submission", "lab"}  # not formal exams, so no exam date
GradeResult = Literal["pending", "1.0", "1.3", "1.7", "2.0", "2.3", "2.7", "3.0", "3.3", "3.7", "4.0", "5.0",
                      "passed", "failed"]


class GradeOut(ORM):
    id: int
    semester_id: int
    subject_id: int
    module_type: ModuleType
    exam_type: ExamType
    exam_date: date | None
    result: GradeResult
    credits: float


class GradeCreate(BaseModel):
    subject_id: int
    module_type: ModuleType = "mandatory"
    exam_type: ExamType = "written"
    exam_date: date | None = None
    result: GradeResult = "pending"
    credits: float = Field(default=5, gt=0, le=99, multiple_of=0.5)


class GradePatch(BaseModel):
    subject_id: int | None = None
    module_type: ModuleType | None = None
    exam_type: ExamType | None = None
    exam_date: date | None = None
    clear_exam_date: bool = False
    result: GradeResult | None = None
    credits: float | None = Field(default=None, gt=0, le=99, multiple_of=0.5)
