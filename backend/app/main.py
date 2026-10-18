from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from .config import ROOT
from .db import Base, engine
from .routers import auth, ip2, journal, notes, planner


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
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
    yield


app = FastAPI(title="Monotion", lifespan=lifespan)

api = APIRouter(prefix="/api")
api.include_router(auth.router)
api.include_router(planner.router)
api.include_router(journal.router)
api.include_router(notes.router)
api.include_router(ip2.router)
app.include_router(api)

# Serve the built React app (frontend/dist) from the same port.
DIST = ROOT / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        f = (DIST / path).resolve()
        if path and f.is_file() and DIST in f.parents:
            return FileResponse(f)
        return FileResponse(DIST / "index.html")
