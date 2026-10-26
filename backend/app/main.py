from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from .config import settings
from .db import SQLITE, Base, engine
from .routers import auth, grades, ip2, journal, notes, planner


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    if not SQLITE:  # a fresh SQLite file gets the current schema from create_all; these upgrade older Postgres data
        # create_all only makes missing tables; columns added later go here
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(120) NOT NULL DEFAULT ''"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_seed VARCHAR(32) NOT NULL DEFAULT ''"))
            # pixelated-photo avatars, replaced by pixel pets the same day
            conn.execute(text("ALTER TABLE users DROP COLUMN IF EXISTS avatar, DROP COLUMN IF EXISTS avatar_source"))
            conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'project'"))
            conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP"))
            # tasks ticked before completed_at existed count as done from now, so they archive 2 days later
            conn.execute(text("UPDATE tasks SET completed_at = now() WHERE done AND completed_at IS NULL"))
            # grades first named their module as text; now they belong to a subject, like notes. Link each to the
            # semester's subject of that name, making the subject if there is none, so no grade is lost.
            if conn.scalar(text("SELECT 1 FROM information_schema.columns WHERE table_name = 'grades' AND column_name = 'module'")):
                conn.execute(text("ALTER TABLE grades ADD COLUMN IF NOT EXISTS subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE"))
                conn.execute(text("""
                    INSERT INTO subjects (semester_id, name, color, position)
                    SELECT DISTINCT g.semester_id, g.module, 'gray', 1000 FROM grades g
                    WHERE g.subject_id IS NULL AND NOT EXISTS (
                        SELECT 1 FROM subjects s WHERE s.semester_id = g.semester_id AND lower(s.name) = lower(g.module))"""))
                conn.execute(text("""
                    UPDATE grades g SET subject_id = (
                        SELECT s.id FROM subjects s WHERE s.semester_id = g.semester_id AND lower(s.name) = lower(g.module)
                        ORDER BY s.id LIMIT 1)
                    WHERE g.subject_id IS NULL"""))
                conn.execute(text("ALTER TABLE grades ALTER COLUMN subject_id SET NOT NULL"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_grades_subject_id ON grades (subject_id)"))
                conn.execute(text("ALTER TABLE grades DROP COLUMN module"))
    yield


app = FastAPI(title="Monotion", lifespan=lifespan)

api = APIRouter(prefix="/api")
api.include_router(auth.router)
api.include_router(planner.router)
api.include_router(journal.router)
api.include_router(notes.router)
api.include_router(ip2.router)
api.include_router(grades.router)
app.include_router(api)

# Serve the built React app (frontend/dist) from the same port.
DIST = settings.frontend_dist
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = (DIST / path).resolve()
        if path and f.is_file() and DIST in f.parents:
            return FileResponse(f)
        return FileResponse(DIST / "index.html")
