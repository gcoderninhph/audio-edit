import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import VideoPlayer from '../VideoPlayer/VideoPlayer';
import Timeline from '../Timeline/Timeline';
import SceneList from '../SceneList/SceneList';
import SubtitlePanel from '../SubtitlePanel/SubtitlePanel';
import ExportPanel from '../ExportPanel/ExportPanel';
import { isPremiumActiveForUser } from '../../utils/authClient';
import { useI18n } from '../../i18n/useI18n';
import './AppEditorWorkspace.css';

export default function AppEditorWorkspace({
  activePlayerSidebarSection,
  activeRightTab,
  auth,
  editor,
  onClosePlayerSidebar,
  onOpenExportConfig,
  onOpenSceneBulkConfig,
  onOpenSceneConfig,
  onOpenSubtitleConfig,
  onOpenVoiceoverAudioConfig,
  onRequireAuth,
  onSeek,
  onSetActiveRightTab,
  onTogglePlayerSidebarSection,
  selectedSceneConfig,
  selectedSceneConfigIndex,
}) {
  const { t } = useI18n();
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const videoPlayerPanelRef = useRef(null);
  const editorRightRef = useRef(null);
  const hideWatermark = isPremiumActiveForUser(auth.user)

  const syncRightPanelHeight = useCallback(() => {
    const editorRightElement = editorRightRef.current;
    if (!editorRightElement || typeof window === 'undefined' || window.innerWidth <= 900) {
      editorRightElement?.style.removeProperty('--matched-right-panel-height');
      return;
    }

    const videoPlayerHeight = videoPlayerPanelRef.current?.getBoundingClientRect?.().height ?? 0;
    if (!videoPlayerHeight) {
      return;
    }

    const nextHeight = Math.max(240, Math.round(videoPlayerHeight));
    editorRightElement.style.setProperty('--matched-right-panel-height', `${nextHeight}px`);
  }, []);

  useEffect(() => {
    syncRightPanelHeight();

    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleWindowResize = () => {
      syncRightPanelHeight();
    };

    window.addEventListener('resize', handleWindowResize);

    if (typeof ResizeObserver !== 'function') {
      return () => {
        window.removeEventListener('resize', handleWindowResize);
      };
    }

    const observer = new ResizeObserver(() => {
      syncRightPanelHeight();
    });

    if (videoPlayerPanelRef.current) {
      observer.observe(videoPlayerPanelRef.current);
    }
    return () => {
      window.removeEventListener('resize', handleWindowResize);
      observer.disconnect();
    };
  }, [syncRightPanelHeight]);

  useEffect(() => {
    if (!isExportModalOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !editor.isExporting) {
        setIsExportModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editor.isExporting, isExportModalOpen]);

  useEffect(() => {
    const setExportRunning = window.desktopBridge?.windowGuard?.setExportRunning;
    if (typeof setExportRunning !== 'function') {
      return undefined;
    }

    void setExportRunning(Boolean(editor.isExporting));

    return () => {
      void setExportRunning(false);
    };
  }, [editor.isExporting]);

  return (
    <main className="app-main">
      <div className="editor-view">
        <div className="editor-left">
          <div className="change-video-area dev-locator-host">
            <DeveloperLocator code="editor.video.current-source" title="Current Video Source" />
            <span className="current-video-name">
              {`📹 ${t('editor.currentVideo')}: `}<strong>{editor.videoName}</strong>
            </span>
            <div className="current-source-actions dev-locator-host">
              <DeveloperLocator code="editor.video.current-source.export-open" title="Open Export Modal Button" />
              <button
                type="button"
                className="btn btn-primary btn-sm current-source-export-btn"
                onClick={() => setIsExportModalOpen(true)}
                disabled={editor.isExporting}
              >
                {t('panel.export.title')}
              </button>
            </div>
          </div>
          <div ref={videoPlayerPanelRef}>
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
              onToggleSidebarSection={onTogglePlayerSidebarSection}
              onCloseSidebarSection={onClosePlayerSidebar}
              hideWatermark={hideWatermark}
            />
          </div>
        </div>

        <div className="editor-right" ref={editorRightRef}>
          <div className="editor-right-tabs dev-locator-host">
            <DeveloperLocator code="editor.tabs.right" title="Editor Right Tabs" />
            <button
              className={`editor-tab ${activeRightTab === 'scenes' ? 'active' : ''}`}
              onClick={() => onSetActiveRightTab('scenes')}
            >
              {`🎬 ${t('editor.tabs.scenes')}`}
            </button>
            <button
              className={`editor-tab ${activeRightTab === 'subtitles' ? 'active' : ''}`}
              onClick={() => onSetActiveRightTab('subtitles')}
            >
              {`📝 ${t('editor.tabs.subtitles')}`}
            </button>
          </div>

          <div
            className="editor-right-panel"
            style={{
              display: activeRightTab === 'scenes' ? 'flex' : 'none',
              height: 'var(--matched-right-panel-height, 600px)',
            }}
          >
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
              onSeekToScene={editor.seekToScene}
              onOpenSceneConfig={onOpenSceneConfig}
              onOpenBulkSceneConfig={onOpenSceneBulkConfig}
              onStartDetection={editor.startDetection}
              videoFile={editor.videoFile}
            />
          </div>

          <div
            className="editor-right-panel"
            style={{
              display: activeRightTab === 'subtitles' ? 'flex' : 'none',
              padding: 0,
              height: 'var(--matched-right-panel-height, 600px)',
            }}
          >
            <SubtitlePanel
              subtitles={editor.filteredSubtitles}
              originalSubtitles={editor.originalSubtitles}
              currentTime={editor.currentTime}
              onDeleteSubtitle={editor.removeSubtitle}
              onUpdateSubtitle={editor.updateSubtitle}
              onSeekToTime={onSeek}
              activeSubtitleLanguage={editor.activeSubtitleLanguage}
              onActiveSubtitleLanguageChange={editor.setActiveSubtitleLanguage}
              subtitleLanguageOptions={editor.subtitleLanguageOptions}
              isTranscribing={editor.isTranscribing}
              transcribeProgress={editor.transcribeProgress}
              onStartTranslation={editor.startTranslation}
              isTranslating={editor.isTranslating}
              translateProgress={editor.translateProgress}
              videoDuration={editor.videoDuration}
              onStartVoiceover={editor.startVoiceover}
              isGeneratingVoiceover={editor.isGeneratingVoiceover}
              voiceoverProgress={editor.voiceoverProgress}
              lastVoiceoverAudioName={editor.lastVoiceoverAudioName}
              isAuthenticated={auth.isAuthenticated}
              authCredits={auth.user?.credits}
              onRequireAuth={onRequireAuth}
            />
          </div>
        </div>

        <div className="editor-timeline dev-locator-host">
          <DeveloperLocator code="panel.timeline" title="Timeline Panel Wrapper" />
          <Timeline
            scenes={editor.scenes}
            deletedSceneIds={editor.deletedSceneIds}
            currentTime={editor.currentTime}
            duration={editor.videoDuration}
            currentScene={editor.currentScene}
            onSeek={onSeek}
            subtitles={editor.filteredSubtitles}
            voiceoverTrack={editor.voiceoverTrack}
            onSubtitleClick={onOpenSubtitleConfig}
            onVoiceoverClick={onOpenVoiceoverAudioConfig}
          />
        </div>

      </div>

      {isExportModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="export-modal-layer" onClick={() => {
          if (!editor.isExporting) {
            setIsExportModalOpen(false);
          }
        }}>
          <div
            className="export-modal-dialog dev-locator-host"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <DeveloperLocator code="panel.export.modal" title="Export Modal" />
            <div className="export-modal-head">
              <h3 id="export-modal-title" className="export-modal-title">{t('panel.export.title')}</h3>
              <button
                type="button"
                className="export-modal-close-btn"
                onClick={() => {
                  if (!editor.isExporting) {
                    setIsExportModalOpen(false);
                  }
                }}
                aria-label="Close"
                title="Close"
                disabled={editor.isExporting}
              >
                x
              </button>
            </div>
            <div className="export-modal-body">
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
                onOpenExportConfig={onOpenExportConfig}
                onExport={(exportOptions) => editor.startExport({ ...exportOptions, hideWatermark })}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </main>
  );
}
