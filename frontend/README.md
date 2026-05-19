# Frontend Workspace

This frontend now uses Electron as the primary runtime for real project work.

- `npm run desktop:dev` watches and rebuilds the renderer into `dist/`, then launches Electron without opening a renderer web port.
- `npm run dev` still serves the renderer in a browser for UI iteration, but local project persistence depends on the Electron desktop bridge.

## Desktop Commands

- `npm run desktop:dev` rebuilds `dist/` on change and launches Electron against the desktop protocol runtime.
- `npm run desktop:start` builds the renderer and launches Electron against the local desktop protocol runtime.

## Backend Runtime

Electron now stores project metadata and source videos in the desktop app data directory. Flask is only used for transcription and translation proxy requests.

Electron reads the backend base URL from runtime config and is pinned to `https://audio-test.accstore.pro.vn` for desktop runtime.

- Start the backend stack with `docker compose up -d` from the workspace root only when you are working on the backend itself.
- The desktop app no longer exposes a localhost override or an Electron-managed local Flask startup path.
