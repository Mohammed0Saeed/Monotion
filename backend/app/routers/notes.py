"""Lecture notes: markdown with LaTeX, references to other notes and lectures, export as .md files."""
import io
import json
import re
import zipfile
from datetime import date
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import LectureNote, Semester, Subject, User
from ..schemas import NoteCreate, NoteOut, NotePatch, NotesIndex, NoteSubject, NoteSummary
from .planner import owned

router = APIRouter(tags=["notes"], dependencies=[Depends(current_user)])

# [[note:12|Label]] or [[lecture:3|Label]]; the label is only a readable fallback, the id is what counts
REF = re.compile(r"\[\[(note|lecture):(\d+)(?:\|([^\]\n]*))?\]\]")


def owned_note(db: Session, nid: int, user: User) -> LectureNote:
    n = db.get(LectureNote, nid)
    if n is None or n.user_id != user.id:
        raise HTTPException(404, "Not found")
    return n


def user_subjects(db: Session, user: User) -> list[tuple[Subject, Semester]]:
    return db.execute(select(Subject, Semester).join(Semester).where(Semester.user_id == user.id)
                      .order_by(Semester.position, Semester.id, Subject.position, Subject.id)).all()


def note_out(db: Session, n: LectureNote) -> NoteOut:
    backlinks = db.scalars(select(LectureNote.id).where(
        LectureNote.user_id == n.user_id, LectureNote.id != n.id,
        or_(LectureNote.body.contains(f"[[note:{n.id}|"), LectureNote.body.contains(f"[[note:{n.id}]]")),
    ).order_by(LectureNote.note_date.desc(), LectureNote.id.desc())).all()
    return NoteOut(**NoteSummary.model_validate(n).model_dump(), body=n.body, backlinks=list(backlinks))


@router.get("/notes", response_model=NotesIndex)
def notes_index(db: Session = Depends(get_db), user: User = Depends(current_user)):
    subjects = [NoteSubject(id=s.id, name=s.name, color=s.color, semester_id=sem.id, semester=sem.name)
                for s, sem in user_subjects(db, user)]
    notes = db.scalars(select(LectureNote).where(LectureNote.user_id == user.id)
                       .order_by(LectureNote.note_date.desc(), LectureNote.id.desc())).all()
    return NotesIndex(subjects=subjects, notes=[NoteSummary.model_validate(n) for n in notes])


@router.post("/notes", response_model=NoteOut)
def create_note(body: NoteCreate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    owned(db, Subject, body.subject_id, user)
    n = LectureNote(user_id=user.id, subject_id=body.subject_id, note_date=body.note_date or date.today(),
                    title=body.title, body="")
    db.add(n)
    db.commit()
    db.refresh(n)
    return note_out(db, n)


@router.get("/notes/{nid}", response_model=NoteOut)
def get_note(nid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return note_out(db, owned_note(db, nid, user))


@router.patch("/notes/{nid}", response_model=NoteOut)
def update_note(nid: int, body: NotePatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    n = owned_note(db, nid, user)
    data = body.model_dump(exclude_unset=True)
    if data.get("subject_id") is not None:
        owned(db, Subject, data["subject_id"], user)
    for k, v in data.items():
        if v is not None:
            setattr(n, k, v)
    db.commit()
    db.refresh(n)
    return note_out(db, n)


@router.delete("/notes/{nid}", status_code=204)
def delete_note(nid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    db.delete(owned_note(db, nid, user))
    db.commit()


# ---------- export ----------
def safe(name: str) -> str:
    """A file or folder name that works on Linux, macOS and Windows."""
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "-", name).strip(" .")
    return name[:120] or "Untitled"


class Library:
    """Where every note of a user lives in an export: <semester>/<lecture>/<date> <title>.md.
    The same layout is used for every export, so links keep working when exports are unpacked side by side."""

    def __init__(self, db: Session, user: User):
        self.subjects = {s.id: (s, sem) for s, sem in user_subjects(db, user)}
        self.notes = {n.id: n for n in db.scalars(select(LectureNote).where(LectureNote.user_id == user.id)
                                                  .order_by(LectureNote.note_date, LectureNote.id))}
        self.paths: dict[int, tuple[str, str, str]] = {}
        taken: set[tuple[str, str, str]] = set()
        for n in self.notes.values():
            folder = self.folder(n.subject_id)
            base, k = f"{n.note_date.isoformat()} {safe(n.title)}", 1
            while (*folder, (name := base + (f" ({k})" if k > 1 else "") + ".md").lower()) in taken:
                k += 1
            taken.add((*folder, name.lower()))
            self.paths[n.id] = (*folder, name)

    def folder(self, subject_id: int) -> tuple[str, str]:
        s, sem = self.subjects[subject_id]
        return safe(sem.name), safe(s.name)

    @staticmethod
    def link(here: tuple[str, ...], to: tuple[str, ...]) -> str:
        if here[0] != to[0]:
            parts = ["..", "..", *to]
        elif here[1] != to[1]:
            parts = ["..", *to[1:]]
        else:
            parts = list(to[2:])
        return "/".join(quote(p) for p in parts if p) or "./"

    def markdown(self, n: LectureNote) -> str:
        here = self.paths[n.id]
        s, sem = self.subjects[n.subject_id]

        def ref(m: re.Match) -> str:
            kind, id_, label = m.group(1), int(m.group(2)), m.group(3)
            if kind == "note" and id_ in self.notes:
                return f"[{self.notes[id_].title or 'Untitled'}]({self.link(here, self.paths[id_])})"
            if kind == "lecture" and id_ in self.subjects:
                return f"[{self.subjects[id_][0].name}]({self.link(here, (*self.folder(id_), ''))})"
            return label or "(deleted)"

        title = n.title or "Untitled"
        front = "\n".join(["---", f"title: {json.dumps(title, ensure_ascii=False)}", f"date: {n.note_date}",
                           f"lecture: {json.dumps(s.name, ensure_ascii=False)}",
                           f"semester: {json.dumps(sem.name, ensure_ascii=False)}", "---"])
        body = REF.sub(ref, n.body).strip()
        return f"{front}\n\n# {title}\n\n{body}\n" if body else f"{front}\n\n# {title}\n"


def attachment(content: bytes | str, filename: str, media_type: str) -> Response:
    ascii_name = filename.encode("ascii", "replace").decode().replace("?", "_").replace('"', "")
    return Response(content, media_type=media_type, headers={
        "Content-Disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"})


@router.get("/notes/{nid}/export")
def export_note(nid: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    owned_note(db, nid, user)
    lib = Library(db, user)
    return attachment(lib.markdown(lib.notes[nid]), lib.paths[nid][2], "text/markdown; charset=utf-8")


@router.get("/semesters/{sid}/notes/export")
def export_notes(sid: int, subject_id: int | None = None, db: Session = Depends(get_db),
                 user: User = Depends(current_user)):
    """A zip of the semester's notes, or of one lecture's notes with ?subject_id=."""
    semester = owned(db, Semester, sid, user)
    lib = Library(db, user)
    if subject_id is not None and (subject_id not in lib.subjects or lib.subjects[subject_id][1].id != sid):
        raise HTTPException(404, "Not found")
    notes = [n for n in lib.notes.values() if lib.subjects[n.subject_id][1].id == sid
             and subject_id in (None, n.subject_id)]
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for n in notes:
            z.writestr("/".join(lib.paths[n.id]), lib.markdown(n))
    name = safe(lib.subjects[subject_id][0].name if subject_id else semester.name)
    return attachment(buf.getvalue(), f"{name} notes.zip", "application/zip")
