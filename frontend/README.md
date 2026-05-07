# Frontend Workspace

This frontend now uses Electron as the primary runtime for real project work.

- `npm run desktop:dev` starts the React renderer inside Electron and launches or connects to the Flask subtitle service at `http://127.0.0.1:5000`.
- `npm run dev` still serves the renderer in a browser for UI iteration, but local project persistence depends on the Electron desktop bridge.

## Desktop Commands

- `npm run desktop:dev` starts Vite on `127.0.0.1:5173`, waits for it to become ready, then launches Electron.
- `npm run desktop:start` builds the renderer and launches Electron against the local production build.

## Backend Runtime

Electron now stores project metadata and source videos in the desktop app data directory. Flask is only used for transcription and translation proxy requests.

Electron reads the backend base URL from runtime config and defaults to `http://127.0.0.1:5000`.

- Set `ELECTRON_SERVER_URL` to point the desktop client at a different Flask host.
- Set `PYTHON_BIN` if Electron needs a specific Python executable when it launches the local server itself.
- Set `ELECTRON_SKIP_BACKEND=1` to connect Electron to an already running Flask server during development.
