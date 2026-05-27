# MAP.desktop_app.editor

## editor shell
- `frontend/src/components/AppShell/AppEditorHeaderStatus.jsx` - Renders the compact editor header status area.
- `frontend/src/components/AppShell/AppEditorWorkspace.jsx` - Composes the editor workspace layout, export modal host, and panel sizing behavior.
- `frontend/src/components/AppShell/AppEditorWorkspace.css` - Styles the editor workspace shell and export modal layout.
- `frontend/src/components/AppShell/ProcessingLockModal.jsx` - Renders the blocking processing modal used during long-running editor jobs.
- `frontend/src/components/DeveloperLocator/DeveloperLocator.jsx` - Renders developer-only locator markers inside desktop UI sections.
- `frontend/src/components/DeveloperLocator/DeveloperLocator.css` - Styles the desktop developer locator host and marker button.

## upload and scenes
- `frontend/src/components/UploadZone/UploadZone.jsx` - Handles source-video picking and drag-drop entry for new editor sessions.
- `frontend/src/components/UploadZone/UploadZone.css` - Styles the upload zone and selected-file summary.
- `frontend/src/components/SceneList/SceneList.jsx` - Renders detected scenes, per-scene actions, and scene-level developer markers.
- `frontend/src/components/SceneList/SceneBulkMotionConfig.jsx` - Renders the bulk scene-motion rule builder for editor quick configuration.
- `frontend/src/components/SceneList/SceneList.css` - Styles the scene list, quick-config panel, and scene cards.
- `frontend/src/components/Timeline/Timeline.jsx` - Renders the kept-scene timeline, subtitle markers, and voiceover track interactions.
- `frontend/src/components/Timeline/Timeline.css` - Styles the timeline, scene blocks, and marker rows.

## subtitles and export panel
- `frontend/src/components/SubtitlePanel/SubtitlePanel.jsx` - Owns subtitle editing, Create Sub, and Vbee narration actions inside the editor.
- `frontend/src/components/SubtitlePanel/SubtitleCreateControls.jsx` - Renders the language selector and Create Sub controls with estimate feedback.
- `frontend/src/components/SubtitlePanel/SubtitleCardList.jsx` - Renders editable subtitle cards for the active subtitle track.
- `frontend/src/components/SubtitlePanel/SubtitleProgressPanel.jsx` - Renders the shared subtitle-job and narration progress shell.
- `frontend/src/components/SubtitlePanel/useCreateSubCreditEstimate.js` - Debounces subtitle credit-estimate requests for Create Sub.
- `frontend/src/components/SubtitlePanel/useVoiceoverCreditEstimate.js` - Debounces Vbee voiceover credit-estimate requests for narration actions.
- `frontend/src/components/SubtitlePanel/SubtitlePanel.css` - Styles subtitle controls, cards, and progress states.
- `frontend/src/components/ExportPanel/ExportPanel.jsx` - Renders export progress, diagnostics, FPS selection, and export result actions.
- `frontend/src/components/ExportPanel/ExportPanel.css` - Styles the export panel and result/diagnostic sections.

## video player
- `frontend/src/components/VideoPlayer/VideoPlayer.jsx` - Owns the editor preview player shell and delegates sidebar, stage, and transport sections.
- `frontend/src/components/VideoPlayer/VideoPlayer.css` - Styles the preview player shell, sidebar, and playback controls.
- `frontend/src/components/VideoPlayer/VideoPlayerExportControls.jsx` - Renders export-config controls inside the player sidebar.
- `frontend/src/components/VideoPlayer/VideoPlayerFrameControls.jsx` - Renders section-specific frame, background, audio, export, and subtitle editor controls.
- `frontend/src/components/VideoPlayer/VideoPlayerFrameControls.css` - Styles the frame-control sidebar and section-specific editor panels.
- `frontend/src/components/VideoPlayer/VideoPlayerFrameSummaryBar.jsx` - Renders the compact frame/background summary bar above the preview stage.
- `frontend/src/components/VideoPlayer/VideoPlayerPreviewStage.jsx` - Draws the composed preview frame, video, subtitles, and watermark state.
- `frontend/src/components/VideoPlayer/VideoPlayerSceneMotionControls.jsx` - Renders manual and detected scene-motion controls.
- `frontend/src/components/VideoPlayer/VideoPlayerSidebar.jsx` - Hosts the left-nav sidebar shell used by the preview player.
- `frontend/src/components/VideoPlayer/VideoPlayerSubtitleControls.jsx` - Renders subtitle appearance controls used by preview and export.
- `frontend/src/components/VideoPlayer/VideoPlayerSubtitleControls.css` - Styles subtitle appearance controls and anchor picker UI.
- `frontend/src/components/VideoPlayer/VideoPlayerTransportControls.jsx` - Renders timeline transport, seek, and audio-mix controls.
- `frontend/src/components/VideoPlayer/useVideoPlayerVoiceover.js` - Owns preview-side voiceover timing and sync behavior.

## editor hooks
- `frontend/src/hooks/useVideoEditor.js` - Coordinates editor state, scene detection, subtitles, voiceover, and export orchestration.
- `frontend/src/hooks/useVideoEditorSubtitleActions.js` - Splits Create Sub, translation, and subtitle-action callbacks out of the main editor hook.
- `frontend/src/hooks/useVideoEditorVoiceoverState.js` - Derives active-language voiceover state for the editor shell.
- `frontend/src/hooks/useEditorSceneListActions.js` - Handles scene-list mutations, seek actions, and export-result invalidation.
- `frontend/src/hooks/useSceneMotionConfig.js` - Owns per-scene motion updates, bulk rules, and face-detection helpers.
- `frontend/src/hooks/useFrameExport.js` - Manages export config, export lifecycle, and native/fallback export execution.
- `frontend/src/hooks/frameExportModel.js` - Holds shared export-model helpers extracted from the main export hook.
- `frontend/src/hooks/useSubtitleTracks.js` - Stores subtitle track collections, active language, and track-level edits.
- `frontend/src/hooks/subtitleJobActions.js` - Runs Create Sub, translation restore, and narration job flows against the backend.
- `frontend/src/hooks/useUndoHistory.js` - Stores undo/redo history behavior for editor state changes.

## editor utilities
- `frontend/src/utils/audioExtractor.js` - Extracts source audio used by subtitle and export workflows.
- `frontend/src/utils/desktopLogger.js` - Bridges renderer-side debug logging into the desktop logging channel.
- `frontend/src/utils/editorSelectors.js` - Centralizes derived selectors over the editor state model.
- `frontend/src/utils/exportAudioMix.js` - Builds audio-mix helpers for source and voiceover output.
- `frontend/src/utils/exportAudioStage.js` - Drives browser-side export audio staging for fallback export paths.
- `frontend/src/utils/exportBenchmarkRunner.js` - Runs the hidden export benchmark flow inside the renderer.
- `frontend/src/utils/exportFrameRate.js` - Normalizes export frame-rate selection and related labels.
- `frontend/src/utils/exportOutputTarget.js` - Resolves export output folder and filename state.
- `frontend/src/utils/exportQualityProfile.js` - Stores export quality profiles and helpers.
- `frontend/src/utils/faceDetection.js` - Runs face-detection helpers used by scene motion targeting.
- `frontend/src/utils/fallbackFrameRecorder.js` - Provides the renderer fallback frame-recording export path.
- `frontend/src/utils/ffmpegExportLogging.js` - Formats FFmpeg export logs for diagnostics.
- `frontend/src/utils/ffmpegManager.js` - Manages browser-side FFmpeg worker loading and lifecycle.
- `frontend/src/utils/ffmpegSceneMerge.js` - Merges scene export segments in fallback/browser export paths.
- `frontend/src/utils/frameCanvasExport.js` - Exports composed frames through the canvas fallback path.
- `frontend/src/utils/frameCanvasRenderer.js` - Renders composed video frames into canvas for preview and export helpers.
- `frontend/src/utils/frameComposer.js` - Centralizes frame composition logic across preview and export helpers.
- `frontend/src/utils/nativeExportClient.js` - Calls Electron IPC for native export execution and result handling.
- `frontend/src/utils/sceneDetection.js` - Detects scene boundaries and thumbnails from source video.
- `frontend/src/utils/sceneGridThumbnails.js` - Builds and restores saved scene-grid thumbnail sheets.
- `frontend/src/utils/sceneMotion.js` - Stores scene-motion primitives and normalization helpers.
- `frontend/src/utils/sceneMotionBulkConfig.js` - Applies grouped scene-motion rules to matching scenes.
- `frontend/src/utils/subtitleAss.js` - Builds ASS subtitle tracks for export-time burn-in.
- `frontend/src/utils/subtitleFontAsset.js` - Loads font assets for subtitle export rendering.
- `frontend/src/utils/subtitleOverlayAssets.js` - Renders cached subtitle overlay PNG assets for native export.
- `frontend/src/utils/subtitleRenderModel.js` - Defines the shared subtitle render model for preview and export.
- `frontend/src/utils/subtitleTracks.js` - Stores pure subtitle-track helpers used by editor hooks and persistence.
- `frontend/src/utils/subtitleUtils.js` - Handles translation jobs, SRT conversion, and Create Sub credit estimation calls.
- `frontend/src/utils/timeMapping.js` - Maps timestamps between source-video time and kept-scene timeline time.
- `frontend/src/utils/videoDisplayLogic.js` - Centralizes player display logic, seek mapping, and playback helpers.
- `frontend/src/utils/voiceoverUtils.js` - Calls Vbee voiceover APIs, polls request status, and returns completed narration blobs.
- `frontend/src/utils/watermarkMotion.js` - Calculates animated watermark positioning for preview and export.
