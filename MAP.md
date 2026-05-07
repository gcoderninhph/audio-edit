# Repository Map

## .github
- `.github/agents/coder.agent.md` - Defines the workspace coding agent workflow, including planning, validation, `TASK.md`, `MAP.md`, and 400-line guardrails.
- `.github/roles/map.role.md` - Documents how to create and update `MAP.md` as the repository query map.
- `.github/roles/task.role.md` - Documents how to create and update `TASK.md` as the persistent task tracker.

## frontend
- `frontend/index.html` - Hosts the Vite root element for the React application.
- `frontend/package.json` - Declares React renderer scripts, Electron desktop launch commands, and frontend runtime or build dependencies.
- `frontend/README.md` - Describes the Electron-first frontend workflow, local desktop persistence, and Flask subtitle-service environment variables.
- `frontend/eslint.config.js` - Configures frontend lint rules.
- `frontend/vite.config.js` - Configures the Vite frontend build and dev server.
- `frontend/electron/main.mjs` - Starts the Electron desktop shell, serves the built renderer in production, manages the local Flask runtime, and registers desktop IPC services.
- `frontend/electron/preload.mjs` - Exposes desktop runtime configuration and local project storage IPC methods to the React renderer through a safe preload bridge.
- `frontend/electron/projectStore.mjs` - Persists project metadata and source videos under the Electron user data directory and serves them over IPC.
- `frontend/src/main.jsx` - Boots the React app into the DOM.
- `frontend/src/App.jsx` - Composes the dashboard and editor UI around the `useVideoEditor` hook.
- `frontend/src/App.css` - Styles the top-level app shell and shared layout states.
- `frontend/src/index.css` - Defines global theme tokens, resets, and shared utility styles.
- `frontend/src/hooks/useEditorPersistence.js` - Handles desktop-local project persistence, source video restore, autosave, and subtitle-job resume logic.
- `frontend/src/hooks/useVideoEditor.js` - Orchestrates editor state, detection, export, subtitle actions, and delegates persistence concerns to `useEditorPersistence.js`.
- `frontend/src/hooks/useUndoHistory.js` - Tracks undo and redo snapshots for editor state changes.
- `frontend/src/utils/audioExtractor.js` - Extracts audio with FFmpeg and polls transcription jobs.
- `frontend/src/utils/editorSelectors.js` - Provides pure selectors for the current scene and subtitle visibility after scene deletions.
- `frontend/src/utils/ffmpegManager.js` - Lazy-loads FFmpeg.wasm and exports kept scenes into a new video file.
- `frontend/src/utils/projectStorage.js` - Wraps the Electron desktop bridge for listing, saving, restoring, and deleting locally stored projects.
- `frontend/src/utils/runtimeConfig.js` - Resolves the backend origin for browser and Electron runtimes and builds API request URLs.
- `frontend/src/utils/sceneDetection.js` - Detects scene boundaries and generates thumbnails from video frames.
- `frontend/src/utils/subtitleUtils.js` - Converts subtitles to and from SRT and manages translation jobs.
- `frontend/src/utils/timeMapping.js` - Maps timestamps between original video time and kept-scene time.
- `frontend/src/components/ProjectDashboard/ProjectDashboard.jsx` - Lists saved projects and starts a new project from a selected video file.
- `frontend/src/components/ProjectDashboard/ProjectDashboard.css` - Styles the project dashboard and project cards.
- `frontend/src/components/UploadZone/UploadZone.jsx` - Handles drag-and-drop or file-picker video selection.
- `frontend/src/components/UploadZone/UploadZone.css` - Styles the upload drop zone and selected-file summary.
- `frontend/src/components/VideoPlayer/VideoPlayer.jsx` - Plays the edited timeline, skips deleted scenes, and overlays active subtitles.
- `frontend/src/components/VideoPlayer/VideoPlayer.css` - Styles the video player, controls, overlays, and scene indicator.
- `frontend/src/components/SceneList/SceneList.jsx` - Displays detected scenes, sensitivity controls, and delete or restore actions.
- `frontend/src/components/SceneList/SceneList.css` - Styles the scene list, cards, and detection states.
- `frontend/src/components/Timeline/Timeline.jsx` - Renders the kept-scene timeline, playhead, and subtitle markers.
- `frontend/src/components/Timeline/Timeline.css` - Styles the timeline bar, scene blocks, subtitles, and tooltip.
- `frontend/src/components/SubtitlePanel/SubtitlePanel.jsx` - Shows subtitle editing, transcription, and translation controls.
- `frontend/src/components/SubtitlePanel/SubtitlePanel.css` - Styles the subtitle list, edit mode, and tool states.
- `frontend/src/components/ExportPanel/ExportPanel.jsx` - Shows export progress, download actions, and saved session history.
- `frontend/src/components/ExportPanel/ExportPanel.css` - Styles the export panel, result state, and history list.

## notebooks

## server
- `server/app.py` - Flask API entrypoint for the desktop subtitle service, with backend health check and proxy route composition only.
- `server/proxy_routes.py` - Registers transcription and translation proxy endpoints that forward requests to external services.
- `server/requirements.txt` - Lists Flask and HTTP client dependencies for the subtitle-service backend.

## root
- `TASK.md` - Tracks active work, validation state, and follow-up refactors for this repository.
- `MAP.md` - Maps files to responsibilities so future tasks can route to the correct owner quickly.