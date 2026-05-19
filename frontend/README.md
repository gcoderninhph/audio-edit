# Frontend Workspace

This frontend now uses Electron as the primary runtime for real project work.

- `npm run desktop:dev` watches and rebuilds the renderer into `dist/`, then launches Electron without opening a renderer web port.
- `npm run dev` still serves the renderer in a browser for UI iteration, but local project persistence depends on the Electron desktop bridge.

## Desktop Commands

- `npm run desktop:dev` rebuilds `dist/` on change and launches Electron against the desktop protocol runtime.
- `npm run desktop:start` builds the renderer and launches Electron against the local desktop protocol runtime.

## Backend Runtime

Electron now stores project metadata and source videos in the desktop app data directory. Flask is only used for transcription and translation proxy requests.

Electron reads the backend base URL from runtime config and now defaults to `https://audio-test.accstore.pro.vn`.

- Start the backend stack with `docker compose up -d` from the workspace root instead of launching `server/app.py` directly.
- Set `ELECTRON_SERVER_URL` to point the desktop client at a different Flask host when needed.
- Set `ELECTRON_SPAWN_BACKEND=1` only if you explicitly want Electron to spawn the local Flask server for troubleshooting.
- Set `PYTHON_BIN` if Electron needs a specific Python executable when it launches that opt-in local server path.
