import { useCallback, useState, useEffect } from 'react';
import './App.css';
import { useVideoEditor } from './hooks/useVideoEditor';
import ProjectDashboard from './components/ProjectDashboard/ProjectDashboard';
import VideoPlayer from './components/VideoPlayer/VideoPlayer';
import Timeline from './components/Timeline/Timeline';
import SceneList from './components/SceneList/SceneList';
import SubtitlePanel from './components/SubtitlePanel/SubtitlePanel';
import ExportPanel from './components/ExportPanel/ExportPanel';

function App() {
  const editor = useVideoEditor();
  const [activeRightTab, setActiveRightTab] = useState('scenes');
  const { redo, setCurrentTime, undo, videoRef } = editor;

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

  const hasVideo = !!editor.videoUrl;
  const hasScenes = editor.scenes.length > 0;

  // ── Loading Screen ──
  if (editor.isRestoring) {
    return (
      <div className="app">
        <Header />
        <main className="app-main">
          <div className="restore-loading">
            <div className="detecting-spinner" />
            <div style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>
              Đang tải project...
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Dashboard View (no video loaded) ──
  if (!hasVideo) {
    return (
      <div className="app">
        <Header />
        <main className="app-main">
          <ProjectDashboard
            onOpenProject={(sessionId) => editor.loadSession(sessionId)}
            onNewProject={(file) => editor.setVideoFile(file)}
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
            <span className="status-badge saving">💾 Đang lưu...</span>
          )}
          {editor.autoSaveStatus === 'saved' && (
            <span className="status-badge saved">✅ Đã lưu</span>
          )}
          <div className="undo-redo-btns">
            <button
              className="btn btn-ghost btn-sm"
              onClick={editor.undo}
              disabled={!editor.canUndo}
              title="Hoàn tác (Ctrl+Z)"
            >
              ↩
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={editor.redo}
              disabled={!editor.canRedo}
              title="Làm lại (Ctrl+Y)"
            >
              ↪
            </button>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={editor.closeProject}
            title="Quay về Dashboard"
          >
            ← Dự án
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
            <div className="change-video-area">
              <span className="current-video-name">
                📹 <strong>{editor.videoName}</strong>
              </span>
            </div>
            <VideoPlayer
              videoUrl={editor.videoUrl}
              videoRef={editor.videoRef}
              onTimeUpdate={editor.setCurrentTime}
              onDurationChange={editor.setVideoDuration}
              currentScene={editor.currentScene}
              scenes={editor.scenes}
              deletedSceneIds={editor.deletedSceneIds}
              subtitles={editor.filteredSubtitles}
            />
          </div>

          {/* Right: Panels */}
          <div className="editor-right">
            <div className="editor-right-tabs">
              <button
                className={`editor-tab ${activeRightTab === 'scenes' ? 'active' : ''}`}
                onClick={() => setActiveRightTab('scenes')}
              >
                🎬 Cảnh Video
              </button>
              <button
                className={`editor-tab ${activeRightTab === 'subtitles' ? 'active' : ''}`}
                onClick={() => setActiveRightTab('subtitles')}
              >
                📝 Phụ Đề
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
                onStartTranscription={editor.startTranscription}
                isTranscribing={editor.isTranscribing}
                transcribeProgress={editor.transcribeProgress}
                onStartTranslation={editor.startTranslation}
                isTranslating={editor.isTranslating}
                translateProgress={editor.translateProgress}
              />
            </div>
          </div>

          {/* Timeline (full width) */}
          {hasScenes && (
            <div className="editor-timeline">
              <Timeline
                scenes={editor.scenes}
                deletedSceneIds={editor.deletedSceneIds}
                currentTime={editor.currentTime}
                duration={editor.videoDuration}
                currentScene={editor.currentScene}
                onSeek={handleSeek}
                subtitles={editor.filteredSubtitles}
              />
            </div>
          )}

          {/* Export Panel (full width) */}
          {hasScenes && (
            <div className="editor-export">
              <ExportPanel
                scenes={editor.scenes}
                keptScenes={editor.keptScenes}
                keptDuration={editor.keptDuration}
                deletedSceneIds={editor.deletedSceneIds}
                isExporting={editor.isExporting}
                exportProgress={editor.exportProgress}
                exportUrl={editor.exportUrl}
                exportSize={editor.exportSize}
                videoName={editor.videoName}
                onExport={editor.startExport}
                onLoadHistoryList={editor.loadHistoryList}
                onLoadSession={editor.loadSession}
                onDeleteSession={editor.deleteSession}
                historyList={editor.historyList}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ── Shared Header Component ──
function Header() {
  return (
    <header className="app-header">
      <div className="app-logo">
        <div className="app-logo-icon">🎬</div>
        <span className="app-logo-text gradient-text">VideoForge</span>
        <span className="app-logo-badge">CLIENT-SIDE</span>
      </div>
    </header>
  );
}

export default App;
