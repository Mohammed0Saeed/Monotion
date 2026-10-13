#!/usr/bin/env bash
# Starts Postgres (docker) and serves Monotion on http://localhost:8000
set -e
cd "$(dirname "$0")"
PY="$PWD/.venv/bin/python"   # python -m, so the venv keeps working if the folder is renamed
docker compose up -d
[ -d frontend/dist ] || (cd frontend && npm install && npm run build)
cd backend
exec "$PY" -m uvicorn app.main:app --host "${HOST:-127.0.0.1}" --port "${PORT:-8000}"
