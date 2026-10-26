from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

SQLITE = settings.database_url.startswith("sqlite")
engine = create_engine(settings.database_url, pool_pre_ping=True,
                       connect_args={"check_same_thread": False} if SQLITE else {})

if SQLITE:
    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(conn, _):
        # off by default in SQLite; the ON DELETE CASCADE rules and the task check constraint rely on it
        conn.execute("PRAGMA foreign_keys=ON")
SessionLocal = sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    with SessionLocal() as db:
        yield db
