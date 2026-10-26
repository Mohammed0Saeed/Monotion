"""Monotion for Windows: the FastAPI backend and the built web UI in one native window.

The server listens on 127.0.0.1 only; data lives in %APPDATA%\\Monotion (SQLite). Run `python desktop/app.py`
from the repo root for development (after `npm run build` in frontend/), or build the .exe with desktop/build.bat.
"""
import os
import secrets
import socket
import sys
import threading
import time
from pathlib import Path

FROZEN = getattr(sys, "frozen", False)
BASE = Path(sys._MEIPASS) if FROZEN else Path(__file__).resolve().parents[1]  # type: ignore[attr-defined]
DATA = Path(os.environ.get("APPDATA") or Path.home() / ".config") / "Monotion"
PORT = 48731  # fixed so the browser storage (login token, theme) is the same on every launch


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def pick_port() -> int:
    with socket.socket() as s:
        try:
            s.bind(("127.0.0.1", PORT))
            return PORT
        except OSError:
            return free_port()  # taken, e.g. by a second Monotion: works, but starts logged out


def secret_key() -> str:
    f = DATA / "secret.key"
    if not f.exists():
        f.write_text(secrets.token_urlsafe(48))
    return f.read_text().strip()


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    if FROZEN:  # a windowed exe has no console; keep uvicorn's output somewhere
        sys.stdout = sys.stderr = open(DATA / "monotion.log", "a", buffering=1, encoding="utf-8")

    os.environ["DATABASE_URL"] = f"sqlite:///{(DATA / 'monotion.db').as_posix()}"
    os.environ["SECRET_KEY"] = secret_key()
    os.environ["FRONTEND_DIST"] = str(BASE / ("frontend_dist" if FROZEN else "frontend/dist"))
    if not FROZEN:
        sys.path.insert(0, str(BASE / "backend"))

    import uvicorn
    import webview
    from app.main import app

    port = pick_port()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_config=None))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    while not server.started and thread.is_alive():
        time.sleep(0.05)

    webview.settings["ALLOW_DOWNLOADS"] = True  # the .md / .zip exports save through a Save As dialog
    webview.create_window("Monotion", f"http://127.0.0.1:{port}", width=1280, height=840, min_size=(480, 600),
                          background_color="#191919")
    webview.start(private_mode=False, storage_path=str(DATA / "webview"))  # keep localStorage between runs

    server.should_exit = True


if __name__ == "__main__":
    main()
