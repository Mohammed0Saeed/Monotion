# PyInstaller spec; run from the repo root: pyinstaller desktop/monotion.spec
from PyInstaller.utils.hooks import collect_submodules

a = Analysis(
    ["app.py"],
    pathex=["../backend"],
    datas=[("../frontend/dist", "frontend_dist")],
    hiddenimports=collect_submodules("uvicorn") + collect_submodules("app") + ["email_validator"],
    excludes=["psycopg", "tkinter"],
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [], exclude_binaries=True,
    name="Monotion", console=False, icon="icon.ico",
)
coll = COLLECT(exe, a.binaries, a.datas, name="Monotion")
