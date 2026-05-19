import DeveloperLocator from '../DeveloperLocator/DeveloperLocator';
import VideoPlayer from '../VideoPlayer/VideoPlayer';
import Timeline from '../Timeline/Timeline';
import SceneList from '../SceneList/SceneList';
import SubtitlePanel from '../SubtitlePanel/SubtitlePanel';
import ExportPanel from '../ExportPanel/ExportPanel';

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
  const hideWatermark = Boolean(auth.user?.isPremium)

  return (
    <main className="app-main">
      <div className="editor-view">
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
            onToggleSidebarSection={onTogglePlayerSidebarSection}
            onCloseSidebarSection={onClosePlayerSidebar}
            hideWatermark={hideWatermark}
          />
        </div>

        <div className="editor-right">
          <div className="editor-right-tabs dev-locator-host">
            <DeveloperLocator code="editor.tabs.right" title="Editor Right Tabs" />
            <button
              className={`editor-tab ${activeRightTab === 'scenes' ? 'active' : ''}`}
              onClick={() => onSetActiveRightTab('scenes')}
            >
              🎬 Scenes
            </button>
            <button
              className={`editor-tab ${activeRightTab === 'subtitles' ? 'active' : ''}`}
              onClick={() => onSetActiveRightTab('subtitles')}
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
              onOpenSceneConfig={onOpenSceneConfig}
              onOpenBulkSceneConfig={onOpenSceneBulkConfig}
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
              onSeekToTime={onSeek}
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
            onOpenExportConfig={onOpenExportConfig}
            onExport={() => editor.startExport({ hideWatermark })}
          />
        </div>
      </div>
    </main>
  );
}
