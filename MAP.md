# Repository Map

## .github
- `.github/agents/coder.agent.md` - Defines the workspace coding agent workflow, including planning, validation, `TASK.md`, `MAP.md`, and 400-line guardrails.
- `.github/roles/map.role.md` - Documents how to create and update `MAP.md` as the repository query map.
- `.github/roles/task.role.md` - Documents how to create and update `TASK.md` as the persistent task tracker.

## frontend
- `frontend/index.html` - Hosts the Vite root element for the React application.
- `frontend/package.json` - Declares React renderer scripts, Electron desktop launch commands, and frontend runtime or build dependencies, including the bundled `ffmpeg-static` binary used by the native fast export path.
- `frontend/README.md` - Describes the Electron-first frontend workflow, local desktop persistence, and Flask subtitle-service environment variables.
- `frontend/eslint.config.js` - Configures frontend lint rules.
- `frontend/vite.config.js` - Configures the Vite frontend build and dev server.
- `frontend/electron/debugLog.mjs` - Writes structured JSONL desktop debug logs under the Electron user data directory, rotates the current log file when it grows too large, and exposes IPC handlers for writing or locating export-debug traces.
- `frontend/electron/main.mjs` - Starts the Electron desktop shell, serves the built renderer in production, manages the local Flask runtime, writes desktop or backend lifecycle events to the structured debug log file, registers native export IPC, and defines the desktop `isDeveloper` toggle used to reveal UI locator markers.
- `frontend/electron/preload.mjs` - Exposes desktop runtime configuration, the `isDeveloper` UI-marker flag, debug-log IPC methods, native export IPC methods, and local project storage IPC methods to the React renderer through a safe preload bridge.
- `frontend/electron/projectMediaProtocol.mjs` - Serves project-stored videos over the `project-media://` Electron protocol with byte-range support so restored desktop videos seek correctly without eager byte materialization.
- `frontend/electron/projectStore.mjs` - Persists project metadata, creation timestamps, output-frame settings, and source videos under the Electron user data directory, preserves explicit `null` clears for saved subtitle job markers, resolves local video paths, serves preview URLs in dashboard summaries, logs project-video byte reads for export diagnosis, and retries local project deletion when Windows still holds a transient file lock.
- `frontend/electron/export/exportCoordinator.mjs` - Coordinates the native fast export job in Electron main: resolves the source video, writes selected image frame backgrounds plus subtitle overlay assets into the job directory, merges kept scenes, delegates chunked frame rendering to the framing pipeline, and streams progress plus logs back to the renderer while tolerating renderer detaches during long exports.
- `frontend/electron/export/framePipeline.mjs` - Splits the native frame-render stage into adaptive duration-based timeline chunks, composes preset colors or cover-image frame backgrounds, applies only the subtitle overlays active in each chunk, runs several FFmpeg framing workers in parallel, aggregates chunk progress back to the renderer, and concatenates the finished framed chunks into the final MP4.
- `frontend/electron/export/nativeFfmpeg.mjs` - Resolves the bundled `ffmpeg-static` binary, probes available hardware encoders, derives aggressive adaptive scene and frame worker plans from host CPU capacity plus timeline size, and runs native FFmpeg child processes while capturing stderr and progress output.
- `frontend/electron/export/scenePipeline.mjs` - Splits kept-scene extraction and concat into a parallel native FFmpeg pipeline with adaptive bounded worker concurrency for CPU-heavy export stages.
- `frontend/electron/subtitleFont.mjs` - Resolves a usable desktop font file from the host OS and exposes it over IPC so the FFmpeg subtitle burn-in path can render text inside the Electron runtime.
- `frontend/src/main.jsx` - Boots the React app into the DOM.
- `frontend/src/App.jsx` - Composes the dashboard and editor UI around the `useVideoEditor` hook and places top-level developer locator markers on major editor and dashboard sections.
- `frontend/src/App.css` - Styles the top-level app shell and shared layout states.
- `frontend/src/index.css` - Defines global theme tokens, resets, and shared utility styles.
- `frontend/src/hooks/useEditorPersistence.js` - Handles desktop-local project persistence, lightweight source video restore, autosave, output-frame setting restore, delegates saved subtitle-job restore to the dedicated helper module, and cleans up the active project before local deletion.
- `frontend/src/hooks/editorPersistenceJobRestore.js` - Restores saved transcription and translation jobs on project load, keeps subtitle-job progress tied to the active session, and clears only confirmed stale job markers.
- `frontend/src/hooks/useVideoEditor.js` - Orchestrates editor state, detection, subtitle actions, and delegates persistence plus frame-aware export concerns to dedicated hooks.
- `frontend/src/hooks/useFrameExport.js` - Owns the editable output-frame settings, including image-backed frame backgrounds, export lifecycle state, export diagnostics state, and frame-aware export entrypoint shared by the player preview and export panel.
- `frontend/src/hooks/useUndoHistory.js` - Tracks undo and redo snapshots for editor state changes.
- `frontend/src/utils/audioExtractor.js` - Extracts audio with FFmpeg, materializes stored project video only when transcription starts, and exposes transcription job snapshot helpers used to restore or clear saved jobs without flashing stale progress.
- `frontend/src/utils/desktopLogger.js` - Wraps the Electron debug-log bridge so renderer export flows can persist structured diagnostics to the desktop JSONL log file.
- `frontend/src/utils/editorSelectors.js` - Provides pure selectors for the current scene and subtitle visibility after scene deletions.
- `frontend/src/utils/ffmpegManager.js` - Tries the native fast export backend first for both color-backed and image-backed frames, then falls back to the FFmpeg.wasm plus record-frame path when native export is unavailable; the fallback path mounts source files through `WORKERFS`, reports live worker progress, and records the shared canvas frame renderer before muxing audio.
- `frontend/src/utils/ffmpegSceneMerge.js` - Re-encodes multiple kept scenes into temporary segment files and concatenates them via a manifest so export avoids the oversized `filter_complex` graph that previously stalled in FFmpeg.wasm.
- `frontend/src/utils/frameComposer.js` - Defines shared output-frame presets, color or image background models, background serialization, and subtitle timing helpers used by the preview frame, persistence, and export compositor.
- `frontend/src/utils/frameCanvasRenderer.js` - Draws preset color or cover-image frame backgrounds, contained video images, and active subtitle cards into a canvas, and also exposes subtitle-card layout helpers so native export overlay assets reuse the same subtitle geometry as the preview.
- `frontend/src/utils/frameCanvasExport.js` - Records the shared canvas frame renderer, including selected image backgrounds, as a video stream during export and returns a video-only blob that is later muxed with the merged audio track.
- `frontend/src/utils/nativeExportClient.js` - Builds the renderer-side native export request, including image-backed frame background payloads when selected, subscribes to streamed Electron progress events, logs concise frame-background descriptions, and converts the returned native export bytes into the download blob used by the UI.
- `frontend/src/utils/projectStorage.js` - Wraps the Electron desktop bridge for listing, saving, restoring, lazily materializing locally stored project videos, and building source descriptors for native desktop export jobs.
- `frontend/src/utils/runtimeConfig.js` - Resolves the backend origin for browser and Electron runtimes, builds API request URLs, and exposes the renderer-side developer-marker toggle.
- `frontend/src/components/DeveloperLocator/DeveloperLocator.jsx` - Renders the developer-only corner marker button that copies a stable location code for UI targeting and review.
- `frontend/src/components/DeveloperLocator/DeveloperLocator.css` - Styles the shared developer locator host wrapper and copy-to-clipboard marker button.
- `frontend/src/utils/sceneDetection.js` - Detects scene boundaries and generates thumbnails from video frames while reusing a playable local video source when available.
- `frontend/src/utils/subtitleAss.js` - Generates an ASS subtitle track from the shared subtitle render model so FFmpeg burn-in can match preview sizing, margins, and wrapped text instead of relying on approximate force-style overrides.
- `frontend/src/utils/subtitleFontAsset.js` - Fetches a desktop-provided font asset through Electron IPC and writes it into the FFmpeg virtual file system so the ASS burn-in path can render text with a known font.
- `frontend/src/utils/subtitleOverlayAssets.js` - Renders deduplicated transparent PNG subtitle cards from the shared canvas subtitle layout so the native fast export backend can overlay them offline without browser recording.
- `frontend/src/utils/subtitleRenderModel.js` - Defines the shared subtitle render specification, line-wrapping logic, and scaled preview styles used by both the in-app frame preview and the exported subtitle burn-in path.
- `frontend/src/utils/subtitleUtils.js` - Converts subtitles to and from SRT, manages translation jobs, downloads completed translation results, probes saved translation job state during restore, and normalizes structured translation API errors into user-facing messages for the subtitle panel.
- `frontend/src/utils/timeMapping.js` - Maps timestamps between original video time and kept-scene time.
- `frontend/src/components/ProjectDashboard/ProjectDashboard.jsx` - Lists saved projects with creation-date sorting and first-frame preview thumbnails, starts a new project from a selected video file, and marks dashboard regions and project cards with developer locator buttons.
- `frontend/src/components/ProjectDashboard/ProjectDashboard.css` - Styles the project dashboard, creation-date sort controls, project cards, and first-frame thumbnail states.
- `frontend/src/components/UploadZone/UploadZone.jsx` - Handles drag-and-drop or file-picker video selection.
- `frontend/src/components/UploadZone/UploadZone.css` - Styles the upload drop zone and selected-file summary.
- `frontend/src/components/VideoPlayer/VideoPlayer.jsx` - Plays the edited timeline inside an editable output-frame preview, exposes frame ratio plus color or image background controls, renders the visible frame through the shared canvas renderer so export can record the same composition, and releases media handles when the player unmounts.
- `frontend/src/components/VideoPlayer/VideoPlayer.css` - Styles the editable output-frame preview, frame controls, image-background picker swatch, playback controls, the shared canvas preview surface, and scene indicator.
- `frontend/src/components/SceneList/SceneList.jsx` - Displays detected scenes, sensitivity controls, and delete or restore actions, with developer locator markers across visible scene-list states and cards.
- `frontend/src/components/SceneList/SceneList.css` - Styles the scene list, cards, and detection states.
- `frontend/src/components/Timeline/Timeline.jsx` - Renders the kept-scene timeline, playhead, and subtitle markers, with a developer locator marker for timeline targeting.
- `frontend/src/components/Timeline/Timeline.css` - Styles the timeline bar, scene blocks, subtitles, and tooltip.
- `frontend/src/components/SubtitlePanel/SubtitlePanel.jsx` - Shows subtitle editing, transcription, and translation controls, with developer locator markers for subtitle states and cards.
- `frontend/src/components/SubtitlePanel/SubtitlePanel.css` - Styles the subtitle list, edit mode, and tool states.
- `frontend/src/components/ExportPanel/ExportPanel.jsx` - Shows export progress, process diagnostics, the active frame summary, download actions, and saved session history, with developer locator markers for the panel and history items.
- `frontend/src/components/ExportPanel/ExportPanel.css` - Styles the export panel, diagnostic log view, frame summary, result state, and history list.

## notebooks

## server
- `server/app.py` - Flask API entrypoint for the desktop subtitle service, with backend health check and proxy route composition only.
- `server/proxy_routes.py` - Registers transcription and translation proxy endpoints, preserves downstream status codes and error payloads for the desktop client, and falls back to a local translation job when the upstream worker-based service is unavailable.
- `server/translation_fallback.py` - Runs local subtitle translation jobs via `deep-translator`, persists lightweight job metadata under `server/uploads/translation-jobs`, and serves the fallback `start -> status -> download` flow used when the upstream translation service cannot accept work.
- `server/requirements.txt` - Lists Flask and HTTP client dependencies for the subtitle-service backend.

## root
- `EXPORT_ARCHITECTURE.md` - Describes the target fast-export architecture: Electron-main native FFmpeg coordination, shared render manifests and overlay assets for parity, hardware probing, and chunk-level parallelism.
- `TASK.md` - Tracks active work, validation state, and follow-up refactors for this repository.
- `MAP.md` - Maps files to responsibilities so future tasks can route to the correct owner quickly.