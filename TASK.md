# TASK

## Active
- [ ] Run one native export on the latest desktop build to benchmark adaptive worker planning
  - Scope: frontend
  - Owner files: `frontend/electron/export/nativeFfmpeg.mjs`, `frontend/electron/export/framePipeline.mjs`, `frontend/electron/export/scenePipeline.mjs`, `frontend/src/utils/nativeExportClient.js`, `frontend/src/utils/ffmpegManager.js`
  - Evidence: the native export planner now scales scene-worker count, frame-worker count, and target chunk duration from logical CPU count, scene count, and total timeline duration instead of the previous coarse fixed defaults.
  - Next step: trigger one native export on the restarted desktop build and compare the logged worker plan, chunk count, and wall-clock completion time in `export-debug.jsonl`.
  - Validation: pending runtime export reproduction on latest desktop build
- [ ] Re-run export on the latest desktop build to confirm record-frame parity
  - Scope: frontend
  - Owner files: `frontend/src/components/VideoPlayer/VideoPlayer.jsx`, `frontend/src/utils/frameCanvasRenderer.js`, `frontend/src/utils/frameCanvasExport.js`, `frontend/src/utils/ffmpegManager.js`
  - Evidence: preview and export previously used different renderers, so the output could not match what the user saw in `panel.video-player`. The latest implementation makes the preview itself use the shared canvas frame renderer, then export records that same renderer and muxes the merged audio back in.
  - Next step: trigger one export on the restarted desktop build and confirm the output visually matches the frame preview while the log shows `Start record-frame compositor from preview renderer` during `framing`.
  - Validation: pending runtime export reproduction on latest desktop build

## Backlog
- [ ] Optimize client RAM for long videos
  - Scope: frontend
  - Owner files: `frontend/src/hooks/useVideoEditor.js`, `frontend/src/hooks/useEditorPersistence.js`, `frontend/src/utils/projectStorage.js`, `frontend/src/utils/sceneDetection.js`, `frontend/src/utils/ffmpegManager.js`, `frontend/src/utils/audioExtractor.js`, `frontend/src/components/SceneList/SceneList.jsx`, `frontend/electron/main.mjs`, `frontend/electron/preload.mjs`, `frontend/electron/projectStore.mjs`
  - Plan: replace eager thumbnail retention with lazy or windowed loading, reduce undo memory amplification for large subtitle sets, and move the heaviest export or audio extraction flows out of the renderer when the steady-state savings are proven.
  - Validation: pending

## Completed
- [x] Make subtitle translation complete successfully when upstream workers are unavailable
  - Scope: server
  - Owner files: `server/proxy_routes.py`, `server/translation_fallback.py`, `server/requirements.txt`, `TASK.md`, `MAP.md`
  - Outcome: the subtitle translation API now still completes when the worker-based LLM-Subtrans backend is unavailable by falling back to a local Google-Translate-backed job flow that preserves the existing `start -> status -> download` contract, while still preferring the upstream service when it is healthy.
  - Validation: Flask `test_client` end-to-end translation succeeded through the live upstream worker path and produced `Hello`; a forced-upstream-failure test also succeeded through the new local fallback path and produced `Hello everyone`; `python -m compileall server`
- [x] Surface actionable subtitle translation startup errors
  - Scope: frontend, server
  - Owner files: `server/proxy_routes.py`, `frontend/src/utils/subtitleUtils.js`, `TASK.md`, `MAP.md`
  - Outcome: the Flask proxy now preserves downstream LLM-Subtrans status codes and error bodies instead of collapsing them into a generic `500`, and the subtitle translation client now surfaces structured backend error messages, including a friendly Vietnamese message when no managed worker is available.
  - Validation: Flask `test_client` POST to `/api/translation/start` now returns downstream `503` with `No available managed worker...`; live runtime `POST /api/translation/start` on `127.0.0.1:5000` now returns the same `503` body after `npm run desktop:start`; `npm run lint`; `npm run build`; `python -m compileall server`
- [x] Implement adaptive native export worker and chunk planning
  - Scope: frontend
  - Owner files: `frontend/electron/export/nativeFfmpeg.mjs`, `frontend/electron/export/framePipeline.mjs`, `frontend/electron/export/scenePipeline.mjs`, `TASK.md`, `MAP.md`
  - Outcome: native export planning now adapts scene extraction concurrency, frame worker count, decode and filter thread budgets, and target chunk duration to the host CPU count, timeline duration, and scene count instead of relying on the previous fixed worker caps and chunk lengths.
  - Validation: `npm run lint`; `npm run build`
- [x] Validate native fast export on a real project
  - Scope: frontend
  - Owner files: `frontend/electron/export/exportCoordinator.mjs`, `frontend/electron/export/framePipeline.mjs`, `frontend/electron/export/nativeFfmpeg.mjs`, `frontend/electron/export/scenePipeline.mjs`, `frontend/electron/preload.mjs`, `frontend/src/utils/nativeExportClient.js`, `frontend/src/utils/subtitleOverlayAssets.js`, `frontend/src/utils/ffmpegManager.js`, `TASK.md`
  - Outcome: the current desktop build completed a full native export end-to-end through the chunked framing pipeline, returned the final MP4 through the renderer bridge, and reported `Export result is ready` without falling back to the renderer-record path.
  - Validation: `npm run lint`; `npm run build`; `npm run desktop:start`; confirmed in `export-debug.jsonl` that job `03a456cb-fc4f-4fb6-a384-5f879ec04e71` reached `Native export completed (113.3 MB)` and `Native fast export completed in renderer bridge`
- [x] Observe the current export run through completion on the latest desktop build
  - Scope: frontend
  - Owner files: `frontend/src/utils/ffmpegManager.js`, `frontend/src/utils/desktopLogger.js`, `frontend/electron/debugLog.mjs`, `TASK.md`
  - Outcome: the latest native export no longer stalls in framing; the log now shows all 12 frame chunks finishing, frame-chunk concat running, the final MP4 being produced, and the renderer receiving a ready-to-download result.
  - Validation: confirmed in `export-debug.jsonl` for job `03a456cb-fc4f-4fb6-a384-5f879ec04e71`