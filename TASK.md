# TASK

## Active
- [ ] Manually confirm player playback in the running desktop build
  - Scope: frontend
  - Owner files: `frontend/src/components/VideoPlayer/VideoPlayer.jsx`, `frontend/electron/main.mjs`, `frontend/electron/projectMediaProtocol.mjs`, `frontend/electron/projectStore.mjs`
  - Evidence: the desktop build now loads the renderer from `desktop://app/index.html` instead of a local renderer HTTP port, stored project videos now resolve under the same desktop protocol path with `Cross-Origin-Resource-Policy` headers, and the player time bar now falls back to the raw video timeline until scene detection data exists.
  - Next step: open the saved `tap4.mp4` project in the running Electron window, press play, and confirm the timer advances from `00:00 / <video duration>` even before scene detection runs.
  - Validation: pending manual smoke test in the live Electron window; automated validation confirmed Electron window startup, backend health `200`, and no renderer listeners on ports `4173` or `5173`

- [ ] Re-run export on the latest desktop build to confirm record-frame parity
  - Scope: frontend
  - Owner files: `frontend/src/components/VideoPlayer/VideoPlayer.jsx`, `frontend/src/utils/frameCanvasRenderer.js`, `frontend/src/utils/frameCanvasExport.js`, `frontend/src/utils/ffmpegManager.js`
  - Evidence: preview and export previously used different renderers, so the output could not match what the user saw in `panel.video-player`. The latest implementation makes the preview itself use the shared canvas frame renderer, then export records that same renderer and muxes the merged audio back in.
  - Next step: force or observe a renderer-record fallback export only when native export is unavailable, then confirm the output visually matches the frame preview while the log shows `Start record-frame compositor from preview renderer` during `framing`.
  - Validation: pending renderer-fallback parity check; the latest image-background export now uses native fast export instead of the record-frame fallback.

## Backlog
- [ ] Optimize client RAM for long videos
  - Scope: frontend
  - Owner files: `frontend/src/hooks/useVideoEditor.js`, `frontend/src/hooks/useEditorPersistence.js`, `frontend/src/utils/projectStorage.js`, `frontend/src/utils/sceneDetection.js`, `frontend/src/utils/ffmpegManager.js`, `frontend/src/utils/audioExtractor.js`, `frontend/src/components/SceneList/SceneList.jsx`, `frontend/electron/main.mjs`, `frontend/electron/preload.mjs`, `frontend/electron/projectStore.mjs`
  - Plan: replace eager thumbnail retention with lazy or windowed loading, reduce undo memory amplification for large subtitle sets, and move the heaviest export or audio extraction flows out of the renderer when the steady-state savings are proven.
  - Validation: pending

## Completed
- [x] Move desktop project data into the repo-local projects folder in dev and keep backend voiceover preview faithful by default
  - Scope: frontend
  - Owner files: `frontend/electron/projectStore.mjs`, `frontend/electron/projectStoreShared.mjs`, `frontend/src/components/VideoPlayer/VideoPlayer.jsx`, `TASK.md`, `MAP.md`
  - Outcome: desktop project metadata, source videos, and saved voiceover audio now default to the workspace-local `projects/` folder while the app still reads older projects and voiceover files from legacy Electron `userData` roots when needed; the preview player also now defaults any newly attached voiceover track to the raw backend narration by muting the source-video track until the user explicitly changes the audio mix.
  - Validation: VS Code diagnostics for `frontend/electron/projectStore.mjs`, `frontend/electron/projectStoreShared.mjs`, and `frontend/src/components/VideoPlayer/VideoPlayer.jsx`; line guardrail checked with `frontend/electron/projectStore.mjs` at 334 lines, `frontend/electron/projectStoreShared.mjs` at 138 lines, and `frontend/src/components/VideoPlayer/VideoPlayer.jsx` at 387 lines; `npm run lint`; `npm run build`; restarted `npm run desktop:start`; confirmed Flask `/api/health` returned `200`; confirmed the workspace root now contains `projects/`.

- [x] Open the left audio nav from panel.timeline.voiceover and split preview volume controls
  - Scope: frontend
  - Owner files: `frontend/src/App.jsx`, `frontend/src/components/Timeline/Timeline.jsx`, `frontend/src/components/Timeline/Timeline.css`, `frontend/src/components/VideoPlayer/VideoPlayer.jsx`, `frontend/src/components/VideoPlayer/VideoPlayerFrameControls.jsx`, `frontend/src/components/VideoPlayer/VideoPlayerFrameControls.css`, `frontend/src/components/VideoPlayer/VideoPlayerSidebar.jsx`, `frontend/src/components/VideoPlayer/VideoPlayerTransportControls.jsx`, `TASK.md`, `MAP.md`
  - Split plan: move the portal sidebar shell into `frontend/src/components/VideoPlayer/VideoPlayerSidebar.jsx` and move the bottom transport row into `frontend/src/components/VideoPlayer/VideoPlayerTransportControls.jsx` so `frontend/src/components/VideoPlayer/VideoPlayer.jsx` can add the new audio-sidebar flow without exceeding the 400-line guardrail.
  - Outcome: clicking `panel.timeline.voiceover` now opens the fixed left nav directly into a new `audio` section, the preview audio controls now let the user balance source-video volume and voiceover volume independently, the bottom transport keeps only the quick source-video slider, and sidebar open state now lives in `App.jsx` so the timeline and player can drive the same nav.
  - Validation: VS Code diagnostics for all touched frontend files; line guardrail checked with `frontend/src/App.jsx` at 286 lines, `frontend/src/components/Timeline/Timeline.jsx` at 205 lines, `frontend/src/components/VideoPlayer/VideoPlayer.jsx` at 375 lines, `frontend/src/components/VideoPlayer/VideoPlayerFrameControls.jsx` at 292 lines, `frontend/src/components/VideoPlayer/VideoPlayerSidebar.jsx` at 29 lines, and `frontend/src/components/VideoPlayer/VideoPlayerTransportControls.jsx` at 47 lines; `npm run lint`; `npm run build`; restarted `npm run desktop:start`; confirmed backend health `200` on the updated build.

- [x] Persist generated voiceover audio in a sibling folder alongside each desktop project instead of downloading it
  - Scope: frontend
  - Owner files: `frontend/electron/projectStore.mjs`, `frontend/electron/projectStoreShared.mjs`, `frontend/electron/preload.mjs`, `frontend/src/utils/projectStorage.js`, `frontend/src/hooks/useEditorPersistence.js`, `frontend/src/hooks/subtitleJobActions.js`, `frontend/src/utils/voiceoverUtils.js`, `frontend/src/hooks/useVideoEditor.js`, `frontend/src/components/SubtitlePanel/SubtitlePanel.jsx`, `TASK.md`, `MAP.md`
  - Split plan: move shared Electron project path, naming, validation, and metadata read or write helpers into a dedicated `frontend/electron/projectStoreShared.mjs` module so `frontend/electron/projectStore.mjs` can support the new sibling voiceover-folder behavior without exceeding the 400-line guardrail.
  - Outcome: the renderer no longer triggers a client-side audio download after Vbee finishes. The returned narration bytes are now saved automatically in a sibling directory next to the current project folder under Electron `userData`, using the pattern `projects/<projectId>-voiceover/voiceover.mp3`; project metadata still stores `voiceover_filename`, `voiceover_original_name`, `voiceover_mime_type`, `voiceover_size`, and `voiceover_duration`; reopening the same project restores the attached voiceover track back into the preview and timeline at `00:00`; and legacy reads still fall back to older voiceover files left inside the original project folder.
  - Validation: VS Code diagnostics for all touched frontend files; line guardrail checked with `frontend/electron/projectStore.mjs` at 370 lines, `frontend/electron/projectStoreShared.mjs` at 128 lines, `frontend/electron/preload.mjs` at 39 lines, `frontend/src/utils/projectStorage.js` at 194 lines, `frontend/src/hooks/useEditorPersistence.js` at 361 lines, `frontend/src/hooks/subtitleJobActions.js` at 219 lines, `frontend/src/utils/voiceoverUtils.js` at 146 lines, `frontend/src/hooks/useVideoEditor.js` at 372 lines, and `frontend/src/components/SubtitlePanel/SubtitlePanel.jsx` at 259 lines; `npm run lint`; `npm run build`; restarted `npm run desktop:start`; confirmed backend health `200` on the updated build.

- [x] Align Vbee voiceover to kept scenes and attach it to the active timeline
  - Scope: frontend
  - Owner files: `frontend/src/App.jsx`, `frontend/src/hooks/useVideoEditor.js`, `frontend/src/hooks/subtitleJobActions.js`, `frontend/src/utils/voiceoverUtils.js`, `frontend/src/components/VideoPlayer/VideoPlayer.jsx`, `frontend/src/components/Timeline/Timeline.jsx`, `frontend/src/components/Timeline/Timeline.css`, `frontend/src/components/SubtitlePanel/SubtitlePanel.jsx`, `TASK.md`, `MAP.md`
  - Outcome: voiceover generation now uses the current kept subtitle timeline instead of the raw subtitle list, so deleted scenes no longer leak into the generated narration and subtitle timings are compressed onto the same kept-scene timeline the player uses. The generated narration is also kept as an in-app voiceover track anchored at `00:00`, shown on `panel.timeline`, and synchronized with the preview player using the current displayed timeline time even after delete or restore scene changes.
  - Validation: VS Code diagnostics for all touched frontend files; line guardrail checked with `frontend/src/hooks/useVideoEditor.js` at 364 lines, `frontend/src/hooks/subtitleJobActions.js` at 204 lines, `frontend/src/utils/voiceoverUtils.js` at 157 lines, `frontend/src/components/VideoPlayer/VideoPlayer.jsx` at 389 lines, `frontend/src/components/Timeline/Timeline.jsx` at 190 lines, and `frontend/src/components/SubtitlePanel/SubtitlePanel.jsx` at 259 lines; `npm run lint`; `npm run build`; live desktop log observed `POST /api/voiceover/start`, repeated `GET /api/voiceover/status/...`, and final `POST /api/voiceover/download` `200`; restarted `npm run desktop:start`; confirmed Electron window `VideoForge — Smart Video Editor`; confirmed port `5000` was listening while `4173` and `5173` stayed closed; confirmed backend health returned `ok`

- [x] Add Vbee subtitle-to-voiceover flow with async polling and auto-download
  - Scope: frontend, server
  - Owner files: `frontend/src/App.jsx`, `frontend/src/components/SubtitlePanel/SubtitlePanel.jsx`, `frontend/src/components/SubtitlePanel/SubtitlePanel.css`, `frontend/src/hooks/useVideoEditor.js`, `frontend/src/hooks/subtitleJobActions.js`, `frontend/src/utils/voiceoverUtils.js`, `server/proxy_routes.py`, `TASK.md`, `MAP.md`
  - Split plan: extract subtitle job orchestration out of `frontend/src/hooks/useVideoEditor.js` into `frontend/src/hooks/subtitleJobActions.js` so the editor hook stays below the 400-line guardrail while adding the new thuyet minh flow.
  - Outcome: the subtitle tools now expose a `Tao thuyet minh` action whenever subtitle data exists, the frontend converts the current subtitle JSON into an `.srt` upload, sends it through the local Flask proxy to the Vbee Router API, polls every `0.5s` for `queued -> processing -> success|failed`, and automatically downloads the returned audio file through the local proxy once Vbee provides a `download_url`.
  - Validation: VS Code diagnostics for all touched frontend and server files; mocked Flask `test_client` checks for `POST /api/voiceover/start`, `GET /api/voiceover/status/<id>`, and `POST /api/voiceover/download`; line guardrail checked with `frontend/src/hooks/useVideoEditor.js` at 347 lines, `frontend/src/hooks/subtitleJobActions.js` at 195 lines, `frontend/src/utils/voiceoverUtils.js` at 135 lines, `frontend/src/components/SubtitlePanel/SubtitlePanel.jsx` at 259 lines, and `server/proxy_routes.py` at 188 lines; `python -m compileall server`; `npm run lint`; `npm run build`; restarted `npm run desktop:start`; confirmed Electron window `VideoForge — Smart Video Editor`; confirmed port `5000` was listening while `4173` and `5173` stayed closed; confirmed backend health `200`

- [x] Show panel.export before scene detection and fall back to full-video export
  - Scope: frontend
  - Owner files: `frontend/src/App.jsx`, `frontend/src/components/ExportPanel/ExportPanel.jsx`, `frontend/src/hooks/useFrameExport.js`, `frontend/src/hooks/useVideoEditor.js`, `TASK.md`, `MAP.md`
  - Outcome: the export panel no longer waits for scene detection to finish before it appears, and when no cuts exist yet the export flow now falls back to one synthetic full-length scene so the user can export the full source video with the current frame settings and subtitle timing instead of being blocked by an empty `keptScenes` list.
  - Validation: VS Code diagnostics for `frontend/src/App.jsx`, `frontend/src/components/ExportPanel/ExportPanel.jsx`, `frontend/src/hooks/useFrameExport.js`, and `frontend/src/hooks/useVideoEditor.js`; line guardrail checked with `frontend/src/App.jsx` at 254 lines, `frontend/src/components/ExportPanel/ExportPanel.jsx` at 208 lines, `frontend/src/hooks/useFrameExport.js` at 214 lines, and `frontend/src/hooks/useVideoEditor.js` at 397 lines; `npm run lint`; `npm run build`; restarted `npm run desktop:start`; confirmed Electron window `VideoForge — Smart Video Editor`; confirmed port `5000` was listening while `4173` and `5173` stayed closed; confirmed backend health `200`

- [x] Show panel.timeline before scene detection runs
  - Scope: frontend
  - Owner files: `frontend/src/App.jsx`, `frontend/src/components/Timeline/Timeline.jsx`, `TASK.md`, `MAP.md`
  - Outcome: the timeline panel no longer waits for `panel.scene-list` to finish scene cutting before it appears; as soon as a video is loaded, the editor now shows a raw-video fallback timeline with the full video duration, a single full-width video track, direct seek behavior, and subtitle markers that later switch over to kept-scene timing once scene detection data exists.
  - Validation: VS Code diagnostics for `frontend/src/App.jsx` and `frontend/src/components/Timeline/Timeline.jsx`; line guardrail checked with `frontend/src/App.jsx` at 256 lines and `frontend/src/components/Timeline/Timeline.jsx` at 161 lines; `npm run lint`; `npm run build`; restarted `npm run desktop:start`; confirmed Electron window `VideoForge — Smart Video Editor`; confirmed port `5000` was listening while `4173` and `5173` stayed closed; confirmed backend health `200`

- [x] Move the player left-nav into a fixed overlay with left-to-right entrance animation
  - Scope: frontend
  - Owner files: `frontend/src/components/VideoPlayer/VideoPlayer.jsx`, `frontend/src/components/VideoPlayer/VideoPlayer.css`, `TASK.md`, `MAP.md`
  - Outcome: the frame-editing left nav no longer sits inside `panel.video-player`; it now renders as a fixed overlay outside the player layout through a portal, dims the rest of the window with a backdrop, keeps its own scroll area, and animates in from the left when opened.
  - Validation: VS Code diagnostics for `frontend/src/components/VideoPlayer/VideoPlayer.jsx` and `frontend/src/components/VideoPlayer/VideoPlayer.css`; line guardrail checked with `frontend/src/components/VideoPlayer/VideoPlayer.jsx` at 351 lines and `frontend/src/components/VideoPlayer/VideoPlayer.css` at 297 lines; `npm run lint`; `npm run build`; `npm run desktop:start`; confirmed Electron window `VideoForge — Smart Video Editor`; confirmed port `5000` was listening while `4173` and `5173` stayed closed

- [x] Simplify panel.video-player.frame-summary to only one-line Khung and Nền buttons
  - Scope: frontend
  - Owner files: `frontend/src/components/VideoPlayer/VideoPlayer.jsx`, `frontend/src/components/VideoPlayer/VideoPlayer.css`, `frontend/src/components/VideoPlayer/VideoPlayerFrameSummaryBar.jsx`, `TASK.md`, `MAP.md`
  - Split plan: move the frame-summary bar into a dedicated `VideoPlayerFrameSummaryBar.jsx` file so `VideoPlayer.jsx` stays under the 400-line guardrail after the summary-button cleanup.
  - Outcome: the extra `Preview sạch` badge is removed, the summary area now keeps only the `Khung` and `Nền` buttons, each button shows its label and current value on a single line with the label visually smaller than the value, and the new summary-bar owner file keeps the player shell below the line-limit guardrail.
  - Validation: VS Code diagnostics for `frontend/src/components/VideoPlayer/VideoPlayer.jsx`, `frontend/src/components/VideoPlayer/VideoPlayer.css`, and `frontend/src/components/VideoPlayer/VideoPlayerFrameSummaryBar.jsx`; line guardrail checked with `frontend/src/components/VideoPlayer/VideoPlayer.jsx` at 383 lines, `frontend/src/components/VideoPlayer/VideoPlayerFrameSummaryBar.jsx` at 41 lines, and `frontend/src/components/VideoPlayer/VideoPlayer.css` at 303 lines; `npm run lint`; `npm run build`; `npm run desktop:start`; confirmed Electron window `VideoForge — Smart Video Editor`; confirmed port `5000` was listening while `4173` and `5173` stayed closed

- [x] Split panel.video-player.frame-summary into dedicated Khung and Nền buttons with section-specific left-nav content
  - Scope: frontend
  - Owner files: `frontend/src/components/VideoPlayer/VideoPlayer.jsx`, `frontend/src/components/VideoPlayer/VideoPlayer.css`, `frontend/src/components/VideoPlayer/VideoPlayerFrameControls.jsx`, `frontend/src/components/VideoPlayer/VideoPlayerFrameControls.css`, `TASK.md`, `MAP.md`
  - Outcome: the frame summary bar no longer uses one generic open button; it now shows separate `Khung` and `Nền` buttons, each button opens the left nav directly into the matching section, the nav content renders only the requested section instead of the full editor, and the left nav now has its own vertical scroll while keeping the same scrollbar styling as the main app view.
  - Validation: VS Code diagnostics for `VideoPlayer.jsx`, `VideoPlayer.css`, `VideoPlayerFrameControls.jsx`, and `VideoPlayerFrameControls.css`; line guardrail checked with `frontend/src/components/VideoPlayer/VideoPlayer.jsx` at 380 lines, `frontend/src/components/VideoPlayer/VideoPlayer.css` at 275 lines, `frontend/src/components/VideoPlayer/VideoPlayerFrameControls.jsx` at 212 lines, and `frontend/src/components/VideoPlayer/VideoPlayerFrameControls.css` at 240 lines; `npm run lint`; `npm run build`; `npm run desktop:start`; confirmed Electron window `VideoForge — Smart Video Editor`; confirmed port `5000` was listening while `4173` and `5173` stayed closed

- [x] Clean up panel.video-player by moving detailed frame editing into a left-side nav
  - Scope: frontend
  - Owner files: `frontend/src/components/VideoPlayer/VideoPlayer.jsx`, `frontend/src/components/VideoPlayer/VideoPlayer.css`, `frontend/src/components/VideoPlayer/VideoPlayerFrameControls.jsx`, `frontend/src/components/VideoPlayer/VideoPlayerFrameControls.css`, `TASK.md`, `MAP.md`
  - Outcome: the player preview now stays visually clean with only a compact summary bar for the current frame ratio and background, detailed frame editing opens in a dedicated left-side nav inside the player, and the background editor now reveals only the detail controls for the currently active mode instead of showing every option at once.
  - Validation: VS Code diagnostics for all touched player files; line guardrail checked with `frontend/src/components/VideoPlayer/VideoPlayer.jsx` at 374 lines, `frontend/src/components/VideoPlayer/VideoPlayer.css` at 269 lines, `frontend/src/components/VideoPlayer/VideoPlayerFrameControls.jsx` at 202 lines, and `frontend/src/components/VideoPlayer/VideoPlayerFrameControls.css` at 240 lines; `npm run lint`; `npm run build`; `npm run desktop:start`; confirmed Electron window `VideoForge — Smart Video Editor`; confirmed port `5000` was listening while `4173` and `5173` stayed closed

- [x] Redesign panel.video-player.frame-controls for clearer UX and split its styles out of VideoPlayer.css
  - Scope: frontend
  - Owner files: `frontend/src/components/VideoPlayer/VideoPlayerFrameControls.jsx`, `frontend/src/components/VideoPlayer/VideoPlayerFrameControls.css`, `frontend/src/components/VideoPlayer/VideoPlayer.css`, `TASK.md`, `MAP.md`
  - Split plan: move the frame-controls toolbar styles into a dedicated `VideoPlayerFrameControls.css` file so the redesigned UI can grow without pushing `VideoPlayer.css` past the 400-line guardrail.
  - Outcome: the frame-controls area now shows a quick summary of the current frame ratio and background, separates ratio choice and background choice into two clearer card-based sections, gives each background mode a more explicit affordance and active state, keeps the fade preset selector in a dedicated follow-up card, and adds developer locator markers for the preset, background, and fade-config sections.
  - Validation: VS Code diagnostics for the touched files; line guardrail checked with `frontend/src/components/VideoPlayer/VideoPlayerFrameControls.jsx` at 198 lines, `frontend/src/components/VideoPlayer/VideoPlayerFrameControls.css` at 379 lines, and `frontend/src/components/VideoPlayer/VideoPlayer.css` at 147 lines; `npm run lint`; `npm run build`; `npm run desktop:start`; confirmed Electron window `VideoForge — Smart Video Editor`; confirmed backend port `5000` was listening after restart

- [x] Add dropdown config for the video-fade frame background
  - Scope: frontend
  - Owner files: `frontend/src/components/VideoPlayer/VideoPlayerFrameControls.jsx`, `frontend/src/components/VideoPlayer/VideoPlayer.css`, `frontend/src/utils/frameComposer.js`, `frontend/src/utils/frameCanvasRenderer.js`, `frontend/electron/export/framePipeline.mjs`, `TASK.md`, `MAP.md`
  - Outcome: the video-fade background now exposes a preset dropdown in `panel.video-player.frame-controls`, the chosen preset is stored inside the shared `frameBackground` model so autosave and export signatures stay in sync, the preview renderer varies blur and dim strength by that preset, and the native frame pipeline uses matching preset-specific blur and overlay settings.
  - Validation: `npm run lint`; `npm run build`; `npm run desktop:start`; confirmed Electron window `VideoForge — Smart Video Editor`; confirmed port `5000` was listening while `4173` and `5173` stayed closed; line guardrail checked with `frontend/electron/export/framePipeline.mjs` at 365 lines

- [x] Add video-fade frame background and split player controls
  - Scope: frontend
  - Owner files: `frontend/src/components/VideoPlayer/VideoPlayer.jsx`, `frontend/src/components/VideoPlayer/VideoPlayerFrameControls.jsx`, `frontend/src/components/VideoPlayer/VideoPlayer.css`, `frontend/src/utils/frameComposer.js`, `frontend/src/utils/frameCanvasRenderer.js`, `frontend/src/utils/frameCanvasExport.js`, `frontend/electron/export/framePipeline.mjs`, `TASK.md`, `MAP.md`
  - Outcome: the frame controls now expose a new fade background derived from the source video itself, the shared canvas preview renders that mode as a blurred and dimmed cover background behind the contained video, the native export frame pipeline mirrors the same concept so preview and export stay aligned, and `VideoPlayer.jsx` was split so the main owner file dropped to 325 lines while the new `VideoPlayerFrameControls.jsx` owns the toolbar UI.
  - Validation: `npm run lint`; `npm run build`; `npm run desktop:start`; confirmed Electron window `VideoForge — Smart Video Editor`; confirmed only port `5000` was listening while `4173` and `5173` stayed closed; measured `frontend/src/components/VideoPlayer/VideoPlayer.jsx` at 325 lines and `frontend/src/components/VideoPlayer/VideoPlayerFrameControls.jsx` at 85 lines

- [x] Make player progress work before scene detection exists
  - Scope: frontend
  - Owner files: `frontend/src/components/VideoPlayer/VideoPlayer.jsx`, `TASK.md`
  - Outcome: the player no longer depends on `keptScenes` to show time or seek state when no scene cuts have been generated yet, so the transport bar now falls back to the raw video timeline and duration until scene detection data is available.
  - Validation: `npm run lint`; `npm run build`; restarted `npm run desktop:start`; confirmed Electron window `VideoForge — Smart Video Editor`; confirmed desktop log reported `Renderer finished load`

- [x] Serve desktop renderer and project media without opening a client web port
  - Scope: frontend
  - Owner files: `frontend/electron/main.mjs`, `frontend/electron/projectMediaProtocol.mjs`, `frontend/electron/projectStore.mjs`, `frontend/package.json`, `frontend/README.md`, `TASK.md`, `MAP.md`
  - Outcome: the desktop app no longer spins up an internal HTTP server for the renderer, production now loads `desktop://app/index.html`, saved project videos resolve under the same desktop protocol path instead of a separate `project-media://` origin, and desktop dev now rebuilds `dist/` in watch mode without opening port `5173`.
  - Validation: `npm run lint`; `npm run build`; `npm run desktop:start`; confirmed Electron window `VideoForge — Smart Video Editor`; confirmed only port `5000` was listening while `4173` and `5173` had no listeners; latest desktop log recorded `Renderer finished load` for `desktop://app/index.html`

- [x] Stabilize hidden-video playback state in the frame preview
  - Scope: frontend
  - Owner files: `frontend/src/components/VideoPlayer/VideoPlayer.jsx`, `TASK.md`
  - Outcome: the frame preview now derives its play or pause button state from the real hidden video element, rewinds to the first kept scene before replaying after the media has reached the end, and immediately syncs seek clicks back into the kept timeline so the preview is less likely to appear frozen after prior playback.
  - Validation: `npm run lint`; `npm run build`; `npm run desktop:start` built successfully before Electron exited shortly after launch with cache errors; `npm run desktop:dev`; observed backend health `200`; confirmed an Electron window titled `VideoForge — Smart Video Editor`; verified ports `5173` and `5000` were listening after restart

- [x] Improve panel export native resource utilization
  - Scope: frontend
  - Owner files: `frontend/electron/export/exportCoordinator.mjs`, `frontend/electron/export/framePipeline.mjs`, `frontend/electron/export/nativeFfmpeg.mjs`, `frontend/src/utils/ffmpegManager.js`, `frontend/src/utils/nativeExportClient.js`, `TASK.md`, `MAP.md`
  - Outcome: image-backed frame exports no longer bypass native export; selected background images are written as native job assets and composed as cover backgrounds in FFmpeg, frame chunks are split by timeline duration instead of scene count so long scenes can use multiple workers, and worker planning now drives more of the host CPU/GPU budget.
  - Validation: VS Code diagnostics; line guardrail checked with largest touched file at 357 lines; `npm run lint`; `npm run build`; `npm run desktop:start`; latest image-background export job `23e0a62a-7a5c-4b7c-8a81-97789a0f82e3` used 12 scene workers on 28 logical CPUs, 10 native frame workers, 36 chunks, `nvidia-nvenc`, and completed `Native export completed (114.7 MB)` / `Native fast export completed in renderer bridge`
- [x] Add external image cover backgrounds for frame export
  - Scope: frontend
  - Owner files: `frontend/src/components/VideoPlayer/VideoPlayer.jsx`, `frontend/src/components/VideoPlayer/VideoPlayer.css`, `frontend/src/utils/frameComposer.js`, `frontend/src/utils/frameCanvasRenderer.js`, `frontend/src/utils/frameCanvasExport.js`, `frontend/src/utils/ffmpegManager.js`, `frontend/src/hooks/useFrameExport.js`, `frontend/src/hooks/useEditorPersistence.js`, `frontend/electron/projectStore.mjs`, `TASK.md`, `MAP.md`
  - Outcome: frame backgrounds now support preset colors or a selected image, the player exposes an image picker with a hidden file input and preview swatch, image backgrounds persist through project metadata, preview/export canvas rendering draws cover images, and export bypasses native fast export for image-backed frames so renderer-record output can match the preview.
  - Validation: VS Code diagnostics; line guardrail checked with largest touched file at 396 lines; `npm run lint`; `npm run build`; `npm run desktop:start`; confirmed backend health `200` and renderer finished load on bundle `index-DetfDFDl.js`
- [x] Sort dashboard projects by creation date and show first-frame thumbnails
  - Scope: frontend
  - Owner files: `frontend/src/components/ProjectDashboard/ProjectDashboard.jsx`, `frontend/src/components/ProjectDashboard/ProjectDashboard.css`, `frontend/src/utils/projectStorage.js`, `frontend/electron/projectStore.mjs`, `TASK.md`, `MAP.md`
  - Outcome: project metadata now preserves `created_at`, dashboard project summaries expose preview URLs, saved projects can be sorted newest or oldest from `dashboard.sort`, and each saved project card renders a first-frame video thumbnail with a fallback state.
  - Validation: VS Code diagnostics; line guardrail checked with largest touched file at 396 lines; `npm run lint`; `npm run build`; `npm run desktop:start`; confirmed backend health `200` and renderer finished load on bundle `index-DetfDFDl.js`
- [x] Preserve subtitle transcription resume across project switches
  - Scope: frontend
  - Owner files: `frontend/src/hooks/editorPersistenceJobRestore.js`, `frontend/src/hooks/useVideoEditor.js`, `frontend/src/utils/audioExtractor.js`, `TASK.md`, `MAP.md`
  - Outcome: reopening a project during `tạo lại phụ đề gốc` now probes the saved `transcription_job_id` instead of clearing it just because older subtitles already exist, and transcription progress callbacks are scoped to the active session so switching projects does not leak progress from one project into another.
  - Validation: `npm run lint`; `npm run build`; `npm run desktop:start`; observed the latest runtime build `index-BN8FipEr.js` start a new transcription job and continue polling `/api/transcription/status/69fc49cb51b8b2bf3b6c4e15` while the patched desktop app was running
- [x] Preserve subtitle translation resume across project switches
  - Scope: frontend
  - Owner files: `frontend/src/hooks/useEditorPersistence.js`, `frontend/src/hooks/editorPersistenceJobRestore.js`, `frontend/src/hooks/useVideoEditor.js`, `frontend/src/utils/subtitleUtils.js`
  - Outcome: project restore no longer clears a valid `translation_job_id` just because source subtitles already exist, reopening a project now probes the saved translation job and either keeps showing progress or downloads the finished translation, and translation progress callbacks are scoped to the active session so switching between projects does not leak progress updates across projects.
  - Validation: `npm run lint`; `npm run build`; `npm run desktop:start`; observed the latest runtime build `index-C4q9INIq.js` poll `/api/translation/status/2ef0946567ad` after restart and then download `/api/translation/download/2ef0946567ad/subtitles_vi_Vietnamese.srt` successfully when the job finished
- [x] Split the oversized editor persistence hook
  - Scope: frontend
  - Owner files: `frontend/src/hooks/useEditorPersistence.js`, `frontend/src/hooks/editorPersistenceJobRestore.js`, `TASK.md`, `MAP.md`
  - Outcome: extracted saved transcription and translation restore helpers into `editorPersistenceJobRestore.js`, reducing `useEditorPersistence.js` from 448 lines to 348 lines while keeping restore behavior localized.
  - Validation: measured `useEditorPersistence.js` at 348 lines; `npm run lint`; `npm run build`
- [x] Prevent stale subtitle job progress on project open
  - Scope: frontend
  - Owner files: `frontend/src/hooks/useEditorPersistence.js`, `frontend/src/utils/audioExtractor.js`, `frontend/src/utils/subtitleUtils.js`, `frontend/electron/projectStore.mjs`, `TASK.md`, `MAP.md`
  - Outcome: project restore now clears in-memory subtitle job state before probing, immediately syncs `sessionIdRef` during restore, and fixes project metadata writes so `null` actually clears stale `transcription_job_id` and `translation_job_id` values instead of preserving them.
  - Validation: found persisted `transcription_job_id` and `translation_job_id` alongside existing subtitles in `C:\Users\ADMIN\AppData\Roaming\frontend\projects\*.json`; verified the root cause in `frontend/electron/projectStore.mjs` where `??` preserved stale job IDs; cleared the existing stale job markers in saved project metadata; `npm run lint`; `npm run build`
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