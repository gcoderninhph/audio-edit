# MAP.desktop_app.runtime

## frontend root
- `frontend/index.html` - Hosts the Vite root element for the desktop renderer.
- `frontend/package.json` - Declares desktop renderer scripts, Electron launch commands, benchmarks, and frontend dependencies.
- `frontend/README.md` - Documents the desktop app workflow, backend policy, and renderer build commands.
- `frontend/eslint.config.js` - Defines lint rules for the desktop frontend.
- `frontend/vite.config.js` - Configures the desktop renderer build and development behavior.
- `frontend/smoke_test.mjs` - Runs the desktop frontend smoke test script.

## frontend electron
- `frontend/electron/main.mjs` - Starts the Electron shell, pins backend access policy, and registers desktop IPC plus lifecycle behavior.
- `frontend/electron/preload.mjs` - Exposes the safe renderer bridge for runtime config, export, storage, and debug IPC.
- `frontend/electron/debugLog.mjs` - Writes structured desktop debug logs and exposes helper IPC for diagnostics.
- `frontend/electron/narratorCompose.mjs` - Downloads, stages, and assembles narration assets through the native desktop compose flow.
- `frontend/electron/projectMediaProtocol.mjs` - Serves renderer assets and stored project media over the custom desktop protocol.
- `frontend/electron/projectStore.mjs` - Persists desktop project metadata, media paths, and top-level project state.
- `frontend/electron/projectStoreShared.mjs` - Centralizes shared project-path, payload, and packaged-build storage helpers.
- `frontend/electron/projectSubtitleStore.mjs` - Saves and restores per-language subtitle track files inside each desktop project.
- `frontend/electron/projectVoiceoverSegmentStore.mjs` - Stores and clears project-local cached narration segment audio files.
- `frontend/electron/projectVoiceoverStore.mjs` - Persists voiceover manifests and migrates older voiceover storage layouts.
- `frontend/electron/subtitleFont.mjs` - Resolves desktop font assets for export-time subtitle rendering.
- `frontend/electron/bin/narrator-compose.exe` - Bundled native narration composer used by packaged desktop builds.

## frontend electron export
- `frontend/electron/export/exportCoordinator.mjs` - Orchestrates native export jobs, output handling, and high-level progress flow.
- `frontend/electron/export/exportAudioStage.mjs` - Builds the native FFmpeg audio stage used by desktop exports.
- `frontend/electron/export/exportOutputIpc.mjs` - Owns IPC for export folder picking, file naming, saving, and reveal actions.
- `frontend/electron/export/frameChunkRunner.mjs` - Executes native frame chunks and manages retry behavior for chunk rendering.
- `frontend/electron/export/frameCudaTurboPath.mjs` - Holds accelerated NVENC/QSV/AMF chunk helpers for the fast native export path.
- `frontend/electron/export/frameFilterGraph.mjs` - Builds the FFmpeg frame filter graph for overlays, backgrounds, subtitles, and watermarks.
- `frontend/electron/export/frameMotionFilter.mjs` - Generates FFmpeg motion and zoom filters for per-scene framing behavior.
- `frontend/electron/export/framePipeline.mjs` - Plans chunked frame rendering and export execution strategy for native desktop export.
- `frontend/electron/export/nativeExportJobHelpers.mjs` - Splits native export asset preparation, progress, and cleanup helpers from the coordinator.
- `frontend/electron/export/nativeFfmpeg.mjs` - Resolves FFmpeg binaries, hardware encoders, worker plans, and child-process execution.
- `frontend/electron/export/scenePipeline.mjs` - Retains the older scene-materialization export path for compatibility and fallback work.
- `frontend/electron/export/timelineInputPlan.mjs` - Maps kept-scene timeline ranges back to source-video input plans for export.

## frontend renderer bootstrap
- `frontend/src/main.jsx` - Boots the React renderer, including the hidden benchmark path and i18n provider wiring.
- `frontend/src/App.jsx` - Composes the top-level desktop shell, dashboard/editor routing, and shared modal orchestration.
- `frontend/src/App.css` - Styles the top-level desktop shell and app-wide overlays.
- `frontend/src/index.css` - Defines global desktop theme tokens, resets, and shared utilities.

## frontend i18n
- `frontend/src/i18n/I18nProvider.jsx` - Provides desktop locale state and translation helpers across the renderer.
- `frontend/src/i18n/i18nConfig.js` - Stores supported locales and translation dictionaries.
- `frontend/src/i18n/i18nContext.js` - Defines the shared React i18n context instance.
- `frontend/src/i18n/useI18n.js` - Exposes the desktop i18n hook used across renderer surfaces.
