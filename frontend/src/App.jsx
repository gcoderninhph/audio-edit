import { useCallback, useState, useEffect, useMemo } from 'react';
import './App.css';
import { useVideoEditor } from './hooks/useVideoEditor';
import ProjectDashboard from './components/ProjectDashboard/ProjectDashboard';
import VideoPlayer from './components/VideoPlayer/VideoPlayer';
import Timeline from './components/Timeline/Timeline';
import SceneList from './components/SceneList/SceneList';
import SubtitlePanel from './components/SubtitlePanel/SubtitlePanel';
import ExportPanel from './components/ExportPanel/ExportPanel';
import DeveloperLocator from './components/DeveloperLocator/DeveloperLocator';

function App() {
  const editor = useVideoEditor();
  const [activeRightTab, setActiveRightTab] = useState('scenes');
  const [activePlayerSidebarSection, setActivePlayerSidebarSection] = useState(null);
  const [selectedSceneConfigId, setSelectedSceneConfigId] = useState(null);
  const [isProjectBrowserOpen, setIsProjectBrowserOpen] = useState(false);
  const { redo, setCurrentTime, undo, videoRef } = editor;
  const hasVideo = !!editor.videoUrl;
  const hasActiveBackgroundTask = Boolean(
    editor.isUploading
    || editor.isDetecting
    || editor.isTranscribing
    || editor.isTranslating
    || editor.isGeneratingVoiceover,
  );

  const handleSeek = useCallback((time) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
    setCurrentTime(time);
  }, [setCurrentTime, videoRef]);

  // ── Ctrl+Z / Ctrl+Y listener ──
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [redo, undo]);

  const handleTogglePlayerSidebarSection = useCallback((section) => {
    setActivePlayerSidebarSection((currentSection) => (currentSection === section ? null : section));
  }, []);

  const handleClosePlayerSidebar = useCallback(() => {
    setActivePlayerSidebarSection(null);
  }, []);

  const handleOpenVoiceoverAudioConfig = useCallback(() => {
    setActivePlayerSidebarSection('audio');
  }, []);

  const handleOpenSubtitleConfig = useCallback(() => {
    setActivePlayerSidebarSection('subtitle');
  }, []);

  const handleOpenExportConfig = useCallback(() => {
    setActivePlayerSidebarSection('export');
  }, []);

  const handleOpenSceneConfig = useCallback((scene) => {
    if (!scene) return;
    editor.seekToScene(scene);
    setSelectedSceneConfigId(scene.id);
    setActivePlayerSidebarSection('scene');
  }, [editor]);

  const handleOpenSceneBulkConfig = useCallback(() => {
    setActivePlayerSidebarSection('scene-bulk');
  }, []);

  const selectedSceneConfig = useMemo(() => {
    if (selectedSceneConfigId === null || selectedSceneConfigId === undefined) {
      return editor.currentScene || null;
    }

    return editor.scenes.find((scene) => scene.id === selectedSceneConfigId) || editor.currentScene || null;
  }, [editor.currentScene, editor.scenes, selectedSceneConfigId]);

  const selectedSceneConfigIndex = useMemo(
    () => editor.keptScenes.findIndex((scene) => scene.id === selectedSceneConfig?.id),
    [editor.keptScenes, selectedSceneConfig?.id],
  );

  const handleOpenProject = useCallback((sessionId) => {
    setActivePlayerSidebarSection(null);

    if (hasActiveBackgroundTask && editor.sessionId && editor.sessionId !== sessionId) {
      alert('The current project still has a background task running. Return to that project or wait for it to finish before opening another one.');
      return;
    }

    setIsProjectBrowserOpen(false);

    if (hasVideo && editor.sessionId === sessionId) {
      return;
    }

    editor.loadSession(sessionId);
  }, [editor, hasActiveBackgroundTask, hasVideo]);

  const handleNewProject = useCallback((file) => {
    if (hasActiveBackgroundTask && hasVideo) {
      alert('The current project still has a background task running. Wait for it to finish before creating a new project.');
      return;
    }

    setActivePlayerSidebarSection(null);
    setIsProjectBrowserOpen(false);
    editor.setVideoFile(file);
  }, [editor, hasActiveBackgroundTask, hasVideo]);

  const handleCloseProject = useCallback(() => {
    setActivePlayerSidebarSection(null);

    if (hasActiveBackgroundTask && hasVideo) {
      setIsProjectBrowserOpen(true);
      return;
    }

    setIsProjectBrowserOpen(false);
    editor.closeProject();
  }, [editor, hasActiveBackgroundTask, hasVideo]);

  // ── Loading Screen ──
  if (editor.isRestoring) {
    return (
      <div className="app">
        <Header />
        <main className="app-main">
          <div className="restore-loading">
            <div className="detecting-spinner" />
            <div style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>
              Loading project...
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Dashboard View (no video loaded) ──
  if (!hasVideo || isProjectBrowserOpen) {
    return (
      <div className="app">
        <Header />
        <main className="app-main">
          <ProjectDashboard
            onOpenProject={handleOpenProject}
            onNewProject={handleNewProject}
          />
        </main>
      </div>
    );
  }

  // ── Editor View ──
  return (
    <div className="app">
      {/* Header with status */}
      <header className="app-header">
        <DeveloperLocator code="header.editor" title="Editor Header" />
        <div className="app-logo">
          <div className="app-logo-icon">🎬</div>
          <span className="app-logo-text gradient-text">VideoForge</span>
        </div>

        <div className="header-status">
          {editor.isUploading && (
            <span className="status-badge uploading">
              ⬆️ Uploading {editor.uploadProgress}%
            </span>
          )}
          {editor.autoSaveStatus === 'saving' && (
            <span className="status-badge saving">💾 Saving...</span>
          )}
          {editor.autoSaveStatus === 'saved' && (
            <span className="status-badge saved">✅ Saved</span>
          )}
          <div className="undo-redo-btns">
            <button
              className="btn btn-ghost btn-sm"
              onClick={editor.undo}
              disabled={!editor.canUndo}
              title="Undo (Ctrl+Z)"
            >
              ↩
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={editor.redo}
              disabled={!editor.canRedo}
              title="Redo (Ctrl+Y)"
            >
              ↪
            </button>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleCloseProject}
            title="Back to Projects"
          >
            ← Projects
          </button>
        </div>
      </header>

      {/* Upload progress bar */}
      {editor.isUploading && (
        <div className="upload-progress-bar">
          <div className="upload-progress-fill" style={{ width: `${editor.uploadProgress}%` }} />
        </div>
      )}

      <main className="app-main">
        <div className="editor-view">
          {/* Left: Video Player */}
          <div className="editor-left">
            <div className="change-video-area dev-locator-host">
              <DeveloperLocator code="editor.video.current-source" title="Current Video Source" />
              <span className="current-video-name">
                📹 <strong>{editor.videoName}</strong>
              </span>
            </div>
            <VideoPlayer
              videoUrl={editor.videoUrl}
              videoRef={editor.videoRef}
              onTimeUpdate={editor.setCurrentTime}
              onDurationChange={editor.setVideoDuration}
              framePresetId={editor.framePresetId}
              onFramePresetChange={editor.setFramePresetId}
              exportQualityProfileId={editor.exportConfig.qualityProfileId}
              onExportQualityProfileChange={editor.exportConfig.setQualityProfileId}
              exportFileName={editor.exportConfig.fileName}
              onExportFileNameChange={editor.exportConfig.setFileName}
              exportOutputDirectory={editor.exportConfig.outputDirectory}
              onChooseExportOutputDirectory={editor.exportConfig.chooseOutputDirectory}
              frameBackground={editor.frameBackground}
              onFrameBackgroundChange={editor.setFrameBackground}
              subtitleSettings={editor.subtitleSettings}
              onSubtitleSettingsChange={editor.setSubtitleSettings}
              currentScene={editor.currentScene}
              scenes={editor.scenes}
              deletedSceneIds={editor.deletedSceneIds}
              subtitles={editor.filteredSubtitles}
              voiceoverTrack={editor.voiceoverTrack}
              videoVolume={editor.videoVolume}
              voiceoverVolume={editor.voiceoverVolume}
              onVideoVolumeChange={editor.handleVideoVolumeChange}
              onVoiceoverVolumeChange={editor.handleVoiceoverVolumeChange}
              onToggleVideoMute={editor.handleToggleVideoMute}
              selectedScene={selectedSceneConfig}
              selectedSceneIndex={selectedSceneConfigIndex}
              onSceneMotionChange={editor.setSceneMotionConfig}
              onDetectSceneFace={editor.detectSceneFace}
              bulkMotionRules={editor.sceneBulkMotionRules}
              onBulkMotionRulesChange={editor.setSceneBulkMotionRules}
              onApplyBulkMotionConfig={editor.applySceneMotionBulkConfig}
              activeSidebarSection={activePlayerSidebarSection}
              onToggleSidebarSection={handleTogglePlayerSidebarSection}
              onCloseSidebarSection={handleClosePlayerSidebar}
            />
          </div>

          {/* Right: Panels */}
          <div className="editor-right">
            <div className="editor-right-tabs dev-locator-host">
              <DeveloperLocator code="editor.tabs.right" title="Editor Right Tabs" />
              <button
                className={`editor-tab ${activeRightTab === 'scenes' ? 'active' : ''}`}
                onClick={() => setActiveRightTab('scenes')}
              >
                🎬 Scenes
              </button>
              <button
                className={`editor-tab ${activeRightTab === 'subtitles' ? 'active' : ''}`}
                onClick={() => setActiveRightTab('subtitles')}
              >
                📝 Subtitles
              </button>
            </div>

            <div className="editor-right-panel" style={{ display: activeRightTab === 'scenes' ? 'flex' : 'none' }}>
              <SceneList
                scenes={editor.scenes}
                deletedSceneIds={editor.deletedSceneIds}
                thumbnails={editor.thumbnails}
                currentScene={editor.currentScene}
                isDetecting={editor.isDetecting}
                detectProgress={editor.detectProgress}
                keptScenes={editor.keptScenes}
                keptDuration={editor.keptDuration}
                onToggleDelete={editor.toggleDeleteScene}
                onRestoreAll={editor.restoreAllScenes}
                onDeleteAll={editor.deleteAllScenes}
                onSeekToScene={editor.seekToScene}
                onOpenSceneConfig={handleOpenSceneConfig}
                onOpenBulkSceneConfig={handleOpenSceneBulkConfig}
                onStartDetection={editor.startDetection}
                sensitivity={editor.sensitivity}
                onSensitivityChange={editor.setSensitivity}
                videoFile={editor.videoFile}
              />
            </div>

            <div className="editor-right-panel" style={{ display: activeRightTab === 'subtitles' ? 'flex' : 'none', padding: 0 }}>
              <SubtitlePanel
                subtitles={editor.filteredSubtitles}
                currentTime={editor.currentTime}
                onUpdateSubtitle={editor.updateSubtitle}
                onSeekToTime={handleSeek}
                activeSubtitleLanguage={editor.activeSubtitleLanguage}
                onActiveSubtitleLanguageChange={editor.setActiveSubtitleLanguage}
                subtitleLanguageOptions={editor.subtitleLanguageOptions}
                onStartTranscription={editor.startTranscription}
                isTranscribing={editor.isTranscribing}
                transcribeProgress={editor.transcribeProgress}
                onStartTranslation={editor.startTranslation}
                isTranslating={editor.isTranslating}
                translateProgress={editor.translateProgress}
                onStartVoiceover={editor.startVoiceover}
                isGeneratingVoiceover={editor.isGeneratingVoiceover}
                voiceoverProgress={editor.voiceoverProgress}
                lastVoiceoverAudioName={editor.lastVoiceoverAudioName}
              />
            </div>
          </div>

          {/* Timeline (full width) */}
          <div className="editor-timeline dev-locator-host">
            <DeveloperLocator code="panel.timeline" title="Timeline Panel Wrapper" />
            <Timeline
              scenes={editor.scenes}
              deletedSceneIds={editor.deletedSceneIds}
              currentTime={editor.currentTime}
              duration={editor.videoDuration}
              currentScene={editor.currentScene}
              onSeek={handleSeek}
              subtitles={editor.filteredSubtitles}
              voiceoverTrack={editor.voiceoverTrack}
              onSubtitleClick={handleOpenSubtitleConfig}
              onVoiceoverClick={handleOpenVoiceoverAudioConfig}
            />
          </div>

          {/* Export Panel (full width) */}
          <div className="editor-export dev-locator-host">
            <DeveloperLocator code="panel.export" title="Export Panel Wrapper" />
            <ExportPanel
              scenes={editor.scenes}
              keptScenes={editor.keptScenes}
              keptDuration={editor.keptDuration}
              deletedSceneIds={editor.deletedSceneIds}
              duration={editor.videoDuration}
              isExporting={editor.isExporting}
              exportProgress={editor.exportProgress}
              exportResult={editor.exportResult}
              videoName={editor.videoName}
              frameSummary={editor.frameSummary}
              frameBackgroundLabel={editor.frameBackgroundLabel}
              exportConfig={editor.exportConfig}
              onOpenExportConfig={handleOpenExportConfig}
              onExport={editor.startExport}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Shared Header Component ──
function Header() {
  return (
    <header className="app-header dev-locator-host">
      <DeveloperLocator code="header.dashboard" title="Dashboard Header" />
      <div className="app-logo">
        <div className="app-logo-icon">🎬</div>
        <span className="app-logo-text gradient-text">VideoForge</span>
        <span className="app-logo-badge">CLIENT-SIDE</span>
      </div>
    </header>
  );
}

export default App;
