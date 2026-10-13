# Monotion

A local, self-hosted task manager and lecture notebook with a Notion-dark look — but with **tasks**, not pages.

- **University** — semesters → subjects → tasks → sub-tasks (unlimited nesting), plus lecture notes with LaTeX
- **Side Projects** — projects → tasks → sub-tasks
- **Journal** *(experimental)* — dated entries with an optional mood, saved as you type
- **Profile** — display name, password, appearance (system / light / dark), stats, log out, delete account

Works on desktop, iPad and iPhone, in light or dark mode.

Login-protected, runs in your browser, data stored in PostgreSQL.

| Layer    | Tech                                              |
|----------|---------------------------------------------------|
| Frontend | React 19 + **TypeScript**, Vite, Lucide icons, Martian Mono (bundled), plain CSS |
| Backend  | Python, FastAPI, SQLAlchemy 2, JWT auth (bcrypt)  |
| Database | PostgreSQL 17 (Docker)                            |

## Requirements

Python 3.11+, Node 20+, Docker (with Compose).

## Quick start

```bash
git clone https://github.com/Mohammed0Saeed/Monotion.git
cd Monotion
cp .env.example .env                                         # then set SECRET_KEY, see Configuration
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt  # first time only
./run.sh                                                     # http://localhost:8000
```

`run.sh` starts Postgres, builds the frontend if `frontend/dist` doesn't exist, and serves API + UI on one port.
On first visit click **Sign up** to create your account.

- Reach it from other devices: `HOST=0.0.0.0 ./run.sh` (then open `http://<server-ip>:8000`). Put it behind HTTPS (e.g. a reverse proxy) if exposed beyond your LAN.
- Change port: `PORT=9000 ./run.sh`

### Local hostname

Monotion runs on its own port (8000), not 80. To open it as `http://notion.maki.local:8000`, map the name to this machine in `/etc/hosts`:

```bash
echo "127.0.0.1  notion.maki.local" | sudo tee -a /etc/hosts
```

For other devices on your network, use this machine's LAN IP instead of `127.0.0.1` on each device, and start with `HOST=0.0.0.0 ./run.sh`. A hosts file can't hold a port, so the `:8000` stays in the URL.

## Using Monotion

- **Tabs**: *University*, *Side Projects* and *Journal* in the top bar. University switches between *Tasks* and *Notes* under the top bar.
- **Semesters**: chips under the top bar; `＋ Semester` adds one, *Rename*/*Delete* act on the selected one.
- **Subjects / projects**: cards. Click the name to rename, the colored dot to change color, 🗑 to delete.
- **Tasks**: `New` / `＋ New task` adds a task. Click a title to edit; checkbox marks done; the red ✕ deletes it.
- **Sub-tasks**: hover a task and press `＋`. Use the ▾/▸ arrow to collapse a branch.
- Inputs: **Enter** saves, **Esc** cancels. When adding tasks, Enter saves and keeps the input open for the next one.
- Each card's bottom edge is a progress bar that fills as its tasks get done.

### Lecture notes

*University → Notes* (next to *Tasks*) holds the notes of the selected semester. Each note belongs to a lecture (a subject), has a date and a title, and saves as you type.

- **Markdown with LaTeX**: `$…$` inline, `$$…$$` displayed. Plain amounts like `$5 and $10` stay text. Rendered with KaTeX, bundled, so it works offline.
- **Code snippets**: fence code with a language, e.g. ` ```python ` … ` ``` `, for syntax highlighting (Python, C/C++, C#, Java, JavaScript/TypeScript, Go, Rust, Kotlin, Haskell, Julia, R, MATLAB, SQL, Bash/shell, JSON, YAML, HTML/XML, CSS, LaTeX, Markdown). Each snippet shows its language and a *Copy* button. The *Code* button wraps the selected text in a fence, and Tab indents inside a code block.
- **Write / Preview**: switch with the buttons or Ctrl/⌘+E. On a wide screen, Write shows the rendered note next to the text.
- **References**: type `[[` (or press *Reference*) and pick a note or lecture from any semester. This inserts `[[note:12|Title]]`, which shows the note's current title, so renaming doesn't break links. A note lists the notes that reference it under *Referenced in*.
- **Export**: the ⤓ button in a note downloads it as `.md`. *Export* in the list downloads the notes of the selected lecture, or of the whole semester, as a zip of `.md` files laid out as `Semester/Lecture/2026-10-13 Title.md`. Each file has YAML front matter (title, date, lecture, semester), references become relative links between the files, and LaTeX stays as `$…$`. That works in Obsidian, Typora, VS Code and GitHub. Unpack several exports into the same folder and links between them keep working.

### Journal (experimental)

*New entry for today* creates an entry dated today; change the date with the date field. Title, text and mood save automatically shortly after you stop typing (and when you switch entries or leave the tab). Pick a mood again to clear it. The data format may still change.

### Light and dark mode

Use the sun/moon button in the top bar, or *Profile → Appearance* to choose System, Light or Dark. The choice is stored per device; *System* follows the device setting.

### iPhone and iPad

1. Start the server reachable on your network: `HOST=0.0.0.0 ./run.sh`.
2. Open `http://<server-ip>:8000` in Safari (or `notion.maki.local:8000` if that name points at the server on your device).
3. *Share → Add to Home Screen* installs it as a full-screen app with the Monotion icon.

On phones the sections move to a bottom tab bar, the journal opens list-then-entry, and log out lives in the profile. Touch devices get larger tap targets and always-visible row actions.

### Design notes

- One typeface, Martian Mono, using its width axis: wide bold card titles, narrow task text so long titles fit. It's bundled with the app, so the server works offline.
- Motion: cards rise in once when a board opens; everything else responds to an action (check-mark draws, strike-through sweeps, sub-tasks slide open, rows slide out on delete, tab pill slides). Turned off when the OS has *reduce motion* enabled.
- Cards alternate left/right in two columns (one column under 960px) and keep their place while you edit.

## Configuration

Create `.env` in the project root (see `.env.example`):

| Variable             | Default                                              | Meaning |
|----------------------|------------------------------------------------------|---------|
| `DATABASE_URL`       | `postgresql+psycopg://maki:maki@127.0.0.1:5432/maki` | SQLAlchemy URL |
| `SECRET_KEY`         | dev value                                            | JWT signing key — **set a long random value** |
| `ALLOW_REGISTRATION` | `true`                                               | Set `false` after creating your account to block sign-ups |

Generate a key with `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`. Changing it logs everyone out.

Database credentials for the container live in `docker-compose.yml`. The database, its user and the Compose project are named `maki`, the project's earlier name. The project name is pinned in `docker-compose.yml` because Compose would otherwise name it after the folder, and renaming the folder would then start a new, empty database.

## Development

```bash
./run.sh &                       # API (+ built UI) on :8000
cd frontend
npm install
npm run dev                      # UI with hot reload on :5173, proxies /api to :8000
npm run typecheck                # tsc --noEmit
npm run build                    # typecheck + production build into frontend/dist
```

After frontend changes, run `npm run build` so `:8000` serves the new UI.

### Project layout

```
backend/app/
  main.py          FastAPI app, creates tables on startup, serves frontend/dist
  config.py        settings from .env
  db.py            engine / session
  models.py        User, Semester, Subject, Project, Task, LectureNote, JournalEntry
  schemas.py       Pydantic request/response models
  auth.py          password hashing, JWT, current_user dependency
  routers/auth.py  register / login / me
  routers/planner.py  semesters, subjects, projects, tasks
  routers/journal.py  journal entries
  routers/notes.py    lecture notes, references, .md / zip export
frontend/src/
  types.ts         shared TypeScript types
  api.ts           typed fetch client + token storage
  App.tsx          top bar, University & Projects boards
  Group.tsx        colored card + recursive task rows
  InlineInput.tsx  Enter-to-save / Esc-to-cancel input used everywhere
  Segmented.tsx    sliding-pill hook for tabs and semesters
  Login.tsx        sign in / sign up
  Profile.tsx      profile, appearance, password, delete account
  Journal.tsx      journal list + autosaving editor
  Notes.tsx        lecture notes: list, editor, reference picker (loaded on demand)
  markdown.ts      markdown + KaTeX + references → sanitised HTML
  theme.ts         light/dark/system theme with the circular reveal
  Avatar.tsx       initial-letter avatar
  styles.css       all styles, light and dark themes
```

### Data model

A `Task` belongs to exactly one `Subject` **or** one `Project` (enforced by a DB check constraint) and may point to a parent task for sub-tasks. Deleting a parent cascades to its sub-tasks; deleting a semester cascades to subjects and tasks.

A `LectureNote` belongs to one `Subject` and is deleted with it (and with its semester). References live in the note's markdown as `[[note:<id>|<title>]]` and `[[lecture:<id>|<name>]]`; the id is what links, the text after `|` is only shown if the target has been deleted. Backlinks are found by searching other notes for the reference, so nothing extra is stored.

Every row is scoped to its owner, so users never see each other's data.

## API

All routes are under `/api`; everything except `/auth/*` needs `Authorization: Bearer <token>`. Interactive docs: http://localhost:8000/docs

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/register`, `/auth/login` | returns `{access_token, username}` |
| GET | `/auth/me` | profile with stats |
| GET/POST | `/semesters` | list / create |
| PATCH/DELETE | `/semesters/{id}` | rename / delete |
| GET | `/semesters/{id}/subjects` | subjects with their tasks (flat list, `parent_id` links sub-tasks) |
| POST | `/semesters/{id}/subjects` | create subject `{name, color}` |
| PATCH/DELETE | `/subjects/{id}` | update name/color/position / delete |
| GET/POST | `/projects` | list with tasks / create |
| PATCH/DELETE | `/projects/{id}` | update / delete |
| POST | `/tasks` | `{title, subject_id \| project_id \| parent_id}` |
| PATCH | `/tasks/{id}` | `title, notes, done, collapsed, due_date, clear_due_date, position` |
| DELETE | `/tasks/{id}` | delete (with sub-tasks) |
| PATCH | `/auth/me` | `{display_name}` |
| POST | `/auth/password` | `{current_password, new_password}` |
| POST | `/auth/delete-account` | `{password}` — deletes the user and all their data |
| GET/POST | `/journal` | list (newest first) / create `{entry_date?}` |
| PATCH/DELETE | `/journal/{id}` | `entry_date, title, body, mood (1–5), clear_mood` / delete |
| GET | `/notes` | `{subjects, notes}`: every lecture and note summary of the user |
| POST | `/notes` | `{subject_id, note_date?, title?}` |
| GET/PATCH/DELETE | `/notes/{id}` | note with `body` and `backlinks` / `subject_id, note_date, title, body` / delete |
| GET | `/notes/{id}/export` | the note as a `.md` file |
| GET | `/semesters/{id}/notes/export[?subject_id=]` | zip of the semester's (or one lecture's) notes |

## Backup & reset

```bash
docker compose exec db pg_dump -U maki maki > maki-backup.sql      # backup
docker compose exec -T db psql -U maki maki < maki-backup.sql      # restore
docker compose down -v                                             # DELETE all data
```

## Not implemented yet

Drag-and-drop reordering, UI for task due dates and per-task notes (stored in DB already), search/filter, proper schema migrations: new tables come from `create_all`, new columns are added by small `ALTER TABLE … IF NOT EXISTS` statements in `backend/app/main.py`. Switch to Alembic if the schema grows.
