# MAP.desktop_app.workspace

## build
- `build/build-desktop.sh` - Packages the Electron desktop app into the root `build/` folder using the validated Windows packaging flow.

## workspace root
- `.dockerignore` - Keeps Docker build context small by excluding workspace artifacts and dependencies.
- `.env` - Stores local runtime secrets and service defaults used by Docker-backed backend flows.
- `.gitignore` - Ignores generated workspace outputs, logs, uploads, and packaged artifacts.
- `.hintrc` - Stores repository-specific hinting configuration.
- `smoke_test.ps1` - Runs the workspace smoke test entrypoint used for manual verification on Windows.

## desktop docs
- `frontend/README.md` - Documents the Electron-first desktop workflow, backend assumptions, and local development commands.
