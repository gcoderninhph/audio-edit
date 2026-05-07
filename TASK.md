# TASK

## Active

## Backlog
- [ ] Resolve the existing VideoPlayer hook warning
  - Scope: frontend
  - Owner files: `frontend/src/components/VideoPlayer/VideoPlayer.jsx`
  - Plan: stabilize or restructure the `handlePlayPause` effect dependency so `react-hooks/exhaustive-deps` stops warning during lint.
  - Validation: pending

## Completed
- [x] Move project persistence to local desktop storage
  - Scope: both
  - Owner files: `frontend/electron/main.mjs`, `frontend/electron/preload.mjs`, `frontend/electron/projectStore.mjs`, `frontend/src/utils/projectStorage.js`, `frontend/src/hooks/useEditorPersistence.js`, `frontend/src/components/ProjectDashboard/ProjectDashboard.jsx`, `frontend/src/hooks/useVideoEditor.js`, `server/app.py`, `server/requirements.txt`, `MAP.md`
  - Outcome: project metadata and source videos are now stored under the Electron desktop app data directory, React project flows load and save through the desktop bridge, and Flask only keeps health plus subtitle transcription or translation proxy endpoints.
  - Validation: `npm run lint` (passes with one pre-existing warning in `frontend/src/components/VideoPlayer/VideoPlayer.jsx`); `npm run build`; `python -m py_compile server/app.py server/proxy_routes.py`; `npm run desktop:start`
- [x] Migrate React web client to desktop runtime
  - Scope: both
  - Owner files: `frontend/package.json`, `frontend/electron/main.mjs`, `frontend/electron/preload.mjs`, `frontend/src/utils/runtimeConfig.js`, `frontend/src/hooks/useEditorPersistence.js`, `frontend/src/utils/audioExtractor.js`, `frontend/src/utils/subtitleUtils.js`, `frontend/src/components/ProjectDashboard/ProjectDashboard.jsx`, `server/app.py`, `MAP.md`
  - Outcome: Flask now runs as an API-only backend, Electron launches the React renderer as a desktop shell, and frontend API calls resolve the backend origin from runtime configuration instead of same-origin web assumptions.
  - Validation: `python -m py_compile server/app.py`; `npm run lint` (passes with one pre-existing warning in `frontend/src/components/VideoPlayer/VideoPlayer.jsx`); `npm run build`; `npm run desktop:start`