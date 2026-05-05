import { useCallback, useState } from 'react';
import './App.css';
import { useVideoEditor } from './hooks/useVideoEditor';
import UploadZone from './components/UploadZone/UploadZone';
import VideoPlayer from './components/VideoPlayer/VideoPlayer';
import Timeline from './components/Timeline/Timeline';
import SceneList from './components/SceneList/SceneList';
import SubtitlePanel from './components/SubtitlePanel/SubtitlePanel';
import ExportPanel from './components/ExportPanel/ExportPanel';

function App() {
  const editor = useVideoEditor();
  const [activeRightTab, setActiveRightTab] = useState('scenes');

  const handleFileSelect = useCallback((file) => {
    editor.setVideoFile(file);
  }, [editor.setVideoFile]);

  const handleSeek = useCallback((time) => {
    if (editor.videoRef.current) {
      editor.videoRef.current.currentTime = time;
    }
    editor.setCurrentTime(time);
  }, [editor.videoRef, editor.setCurrentTime]);

  const handleChangeVideo = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) handleFileSelect(file);
    };
    input.click();
  }, [handleFileSelect]);

  const hasVideo = !!editor.videoUrl;
  const hasScenes = editor.scenes.length > 0;

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="app-logo">
          <div className="app-logo-icon">🎬</div>
          <span className="app-logo-text gradient-text">VideoForge</span>
          <span className="app-logo-badge">CLIENT-SIDE</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main">
        {!hasVideo ? (
          /* Upload View */
          <div className="upload-view">
            <UploadZone
              onFileSelect={handleFileSelect}
              selectedFile={editor.videoFile}
            />
          </div>
        ) : (
          /* Editor View */
          <div className="editor-view">
            {/* Left: Video Player */}
            <div className="editor-left">
              <div className="change-video-area">
                <span className="current-video-name">
                  📹 <strong>{editor.videoName}</strong>
                </span>
                <button className="btn btn-ghost btn-sm" onClick={handleChangeVideo}>
                  Đổi video
                </button>
              </div>
              <VideoPlayer
                videoUrl={editor.videoUrl}
                videoRef={editor.videoRef}
                onTimeUpdate={editor.setCurrentTime}
                onDurationChange={editor.setVideoDuration}
                currentScene={editor.currentScene}
                scenes={editor.scenes}
                subtitles={editor.subtitles}
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
                  isTranscribing={editor.isTranscribing}
                  transcribeProgress={editor.transcribeProgress}
                  onStartTranscription={editor.startTranscription}
                  subtitles={editor.subtitles}
                  isTranslating={editor.isTranslating}
                  translateProgress={editor.translateProgress}
                  onStartTranslation={editor.startTranslation}
                />
              </div>

              <div className="editor-right-panel" style={{ display: activeRightTab === 'subtitles' ? 'flex' : 'none', padding: 0 }}>
                <SubtitlePanel
                  subtitles={editor.subtitles}
                  currentTime={editor.currentTime}
                  onUpdateSubtitle={editor.updateSubtitle}
                  onSeekToTime={handleSeek}
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
                  subtitles={editor.subtitles}
                  onUpdateSubtitle={editor.updateSubtitle}
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
                  onSaveSession={editor.saveSession}
                  onLoadHistoryList={editor.loadHistoryList}
                  onLoadSession={editor.loadSession}
                  onDeleteSession={editor.deleteSession}
                  historyList={editor.historyList}
                />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
