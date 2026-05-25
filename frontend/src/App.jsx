import { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import './App.css';
import { useVideoEditor } from './hooks/useVideoEditor';
import { useAuthSession } from './hooks/useAuthSession';
import AuthDialog from './components/Auth/AuthDialog';
import AppHeader from './components/AppShell/AppHeader';
import AppEditorHeaderStatus from './components/AppShell/AppEditorHeaderStatus';
import ProcessingLockModal from './components/AppShell/ProcessingLockModal';
import AppEditorWorkspace from './components/AppShell/AppEditorWorkspace';
import CreditPackagesDialog from './components/AppShell/CreditPackagesDialog';
import PremiumPackagesDialog from './components/AppShell/PremiumPackagesDialog';
import AdminBootstrapSetup from './components/Admin/AdminBootstrapSetup';
import AdminConsole from './components/Admin/AdminConsole';
import ProjectDashboard from './components/ProjectDashboard/ProjectDashboard';
import { useI18n } from './i18n/useI18n';

function App() {
  const { t } = useI18n();
  const editor = useVideoEditor();
  const auth = useAuthSession();
  const detectionOverlayShownAtRef = useRef(0);
  const [activeRightTab, setActiveRightTab] = useState('scenes');
  const [activePlayerSidebarSection, setActivePlayerSidebarSection] = useState(null);
  const [selectedSceneConfigId, setSelectedSceneConfigId] = useState(null);
  const [isAdminConsoleOpen, setIsAdminConsoleOpen] = useState(false);
  const [isProjectBrowserOpen, setIsProjectBrowserOpen] = useState(false);
  const [dashboardSeriesContext, setDashboardSeriesContext] = useState({
    selectedEpisodeId: '',
    selectedSeriesId: '',
  });
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [creditDialogSourceCode, setCreditDialogSourceCode] = useState('header.dashboard');
  const [isCreditDialogOpen, setIsCreditDialogOpen] = useState(false);
  const [premiumDialogSourceCode, setPremiumDialogSourceCode] = useState('header.dashboard');
  const [isPremiumDialogOpen, setIsPremiumDialogOpen] = useState(false);
  const [isDetectionOverlayLatched, setIsDetectionOverlayLatched] = useState(false);
  const { redo, setCurrentTime, undo, videoRef } = editor;
  const isDetectionOverlayVisible = editor.isDetecting || isDetectionOverlayLatched;
  const voiceoverModalTitle = t('panel.subtitleList.voiceoverPhase');
  const voiceoverModalMessage = editor.voiceoverProgress?.phase || '';
  const processingLockConfig = isDetectionOverlayVisible
    ? {
        ariaLabel: 'Scene detection in progress',
        code: 'panel.scene-list.detecting.modal',
        locatorTitle: 'Scene Detection Blocking Modal',
        progressPercent: editor.detectProgress,
        title: 'Analyzing video...',
      }
    : editor.isGeneratingVoiceover
      ? {
          ariaLabel: 'Voiceover generation in progress',
          code: 'panel.subtitle.voiceover.modal',
          locatorTitle: 'Voiceover Blocking Modal',
          message: voiceoverModalMessage === voiceoverModalTitle ? '' : voiceoverModalMessage,
          progressFill: 'linear-gradient(90deg, #f59e0b, #fb7185)',
          progressPercent: editor.voiceoverProgress?.percent ?? 0,
          spinnerColor: '#f59e0b',
          title: voiceoverModalTitle,
        }
      : null;
  const isProcessingLockVisible = Boolean(processingLockConfig);
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

  useEffect(() => {
    if (editor.isDetecting) {
      detectionOverlayShownAtRef.current = Date.now();
      const timeoutId = window.setTimeout(() => {
        setIsDetectionOverlayLatched(true);
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }

    const visibleFor = Date.now() - detectionOverlayShownAtRef.current;
    const remainingVisibleMs = Math.max(0, 320 - visibleFor);
    const timeoutId = window.setTimeout(() => {
      setIsDetectionOverlayLatched(false);
    }, remainingVisibleMs);

    return () => window.clearTimeout(timeoutId);
  }, [editor.isDetecting]);

  useEffect(() => {
    if (!isProcessingLockVisible) {
      return undefined;
    }

    const blockKeyDown = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('keydown', blockKeyDown, true);
    return () => window.removeEventListener('keydown', blockKeyDown, true);
  }, [isProcessingLockVisible]);

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

  const handleOpenProject = useCallback((sessionId, dashboardContext = null) => {
    setActivePlayerSidebarSection(null);

    if (hasActiveBackgroundTask && editor.sessionId && editor.sessionId !== sessionId) {
      alert(t('app.alerts.openProjectBusy'));
      return;
    }

    if (dashboardContext && typeof dashboardContext === 'object') {
      setDashboardSeriesContext({
        selectedEpisodeId: String(dashboardContext.selectedEpisodeId || ''),
        selectedSeriesId: String(dashboardContext.selectedSeriesId || ''),
      });
    }

    setIsProjectBrowserOpen(false);

    if (hasVideo && editor.sessionId === sessionId) {
      return;
    }

    editor.loadSession(sessionId);
  }, [editor, hasActiveBackgroundTask, hasVideo, t]);

  const handleNewProject = useCallback((file) => {
    if (hasActiveBackgroundTask && hasVideo) {
      alert(t('app.alerts.newProjectBusy'));
      return;
    }

    setActivePlayerSidebarSection(null);
    setIsProjectBrowserOpen(false);
    editor.setVideoFile(file);
  }, [editor, hasActiveBackgroundTask, hasVideo, t]);

  const handleCloseProject = useCallback(() => {
    setActivePlayerSidebarSection(null);

    if (hasActiveBackgroundTask && hasVideo) {
      setIsProjectBrowserOpen(true);
      return;
    }

    setIsProjectBrowserOpen(false);
    editor.closeProject();
  }, [editor, hasActiveBackgroundTask, hasVideo]);

  const handleOpenAuthDialog = useCallback(() => {
    auth.clearError?.();
    setIsAuthDialogOpen(true);
  }, [auth]);

  const handleOpenCreditDialog = useCallback((sourceCode = 'header.dashboard') => {
    setCreditDialogSourceCode(sourceCode);
    setIsCreditDialogOpen(true);
  }, []);

  const handleOpenPremiumDialog = useCallback((sourceCode = 'header.dashboard') => {
    setPremiumDialogSourceCode(sourceCode);
    setIsPremiumDialogOpen(true);
  }, []);

  const handleCloseAuthDialog = useCallback(() => {
    setIsAuthDialogOpen(false);
  }, []);

  const handleCloseCreditDialog = useCallback(() => {
    setIsCreditDialogOpen(false);
  }, []);

  const handleClosePremiumDialog = useCallback(() => {
    setIsPremiumDialogOpen(false);
  }, []);

  const handleOpenAdminConsole = useCallback(() => {
    setIsAdminConsoleOpen(true);
  }, []);

  const handleCloseAdminConsole = useCallback(() => {
    setIsAdminConsoleOpen(false);
  }, []);

  const authDialog = (
    <AuthDialog
      key={isAuthDialogOpen ? 'auth-dialog-open' : 'auth-dialog-closed'}
      auth={auth}
      open={isAuthDialogOpen}
      onClose={handleCloseAuthDialog}
    />
  );
  const creditDialog = (
    <CreditPackagesDialog
      auth={auth}
      locatorCode={creditDialogSourceCode}
      onClose={handleCloseCreditDialog}
      open={isCreditDialogOpen}
    />
  );
  const premiumDialog = (
    <PremiumPackagesDialog
      auth={auth}
      locatorCode={premiumDialogSourceCode}
      onClose={handleClosePremiumDialog}
      open={isPremiumDialogOpen}
    />
  );
  const isAdminConsoleVisible = isAdminConsoleOpen && auth.isAdmin && !auth.requiresAdminSetup;

  if (auth.requiresAdminSetup) {
    return (
      <div className="app">
        <AppHeader
          auth={auth}
          locatorCode="header.admin-bootstrap"
          locatorTitle="Admin Bootstrap Header"
          onOpenAuthDialog={handleOpenAuthDialog}
          onOpenCreditDialog={handleOpenCreditDialog}
          onOpenPremiumDialog={handleOpenPremiumDialog}
          title={t('app.titles.admin')}
        />
        <AdminBootstrapSetup auth={auth} />
        {authDialog}
        {creditDialog}
        {premiumDialog}
      </div>
    );
  }

  if (isAdminConsoleVisible) {
    return (
      <div className="app">
        <AppHeader
          auth={auth}
          locatorCode="header.admin-console"
          locatorTitle="Admin Console Header"
          onOpenAdminConsole={handleOpenAdminConsole}
          onOpenAuthDialog={handleOpenAuthDialog}
          onOpenCreditDialog={handleOpenCreditDialog}
          onOpenPremiumDialog={handleOpenPremiumDialog}
          title={t('app.titles.admin')}
        >
          <button className="btn btn-ghost btn-sm" type="button" onClick={handleCloseAdminConsole}>
            {`← ${t('dashboard.title')}`}
          </button>
        </AppHeader>
        <main className="app-main">
          <AdminConsole />
        </main>
        {authDialog}
        {creditDialog}
        {premiumDialog}
      </div>
    );
  }

  // ── Loading Screen ──
  if (editor.isRestoring) {
    return (
      <div className="app">
        <AppHeader
          auth={auth}
          locatorCode="header.dashboard"
          locatorTitle="Dashboard Header"
          onOpenAdminConsole={handleOpenAdminConsole}
          onOpenAuthDialog={handleOpenAuthDialog}
          onOpenCreditDialog={handleOpenCreditDialog}
          onOpenPremiumDialog={handleOpenPremiumDialog}
          showPremiumButton
          showClientBadge
        />
        <main className="app-main">
          <div className="restore-loading">
            <div className="detecting-spinner" />
            <div style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>
              {t('app.loadingProject')}
            </div>
          </div>
        </main>
        {authDialog}
        {creditDialog}
        {premiumDialog}
      </div>
    );
  }

  // ── Dashboard View (no video loaded) ──
  if (!hasVideo || isProjectBrowserOpen) {
    return (
      <div className="app">
        <AppHeader
          auth={auth}
          locatorCode="header.dashboard"
          locatorTitle="Dashboard Header"
          onOpenAdminConsole={handleOpenAdminConsole}
          onOpenAuthDialog={handleOpenAuthDialog}
          onOpenCreditDialog={handleOpenCreditDialog}
          onOpenPremiumDialog={handleOpenPremiumDialog}
          showPremiumButton
          showClientBadge
        />
        <main className="app-main">
          <ProjectDashboard
            auth={auth}
            onOpenProject={handleOpenProject}
            onNewProject={handleNewProject}
            onSeriesContextChange={setDashboardSeriesContext}
            selectedEpisodeId={dashboardSeriesContext.selectedEpisodeId}
            selectedSeriesId={dashboardSeriesContext.selectedSeriesId}
          />
        </main>
        {authDialog}
        {creditDialog}
        {premiumDialog}
      </div>
    );
  }

  // ── Editor View ──
  return (
    <div className="app">
      <AppHeader
        auth={auth}
        locatorCode="header.editor"
        locatorTitle="Editor Header"
        onOpenAdminConsole={handleOpenAdminConsole}
        onOpenAuthDialog={handleOpenAuthDialog}
        onOpenCreditDialog={handleOpenCreditDialog}
        onOpenPremiumDialog={handleOpenPremiumDialog}
        showPremiumButton
      >
        <AppEditorHeaderStatus editor={editor} onCloseProject={handleCloseProject} />
      </AppHeader>

      {/* Upload progress bar */}
      {editor.isUploading && (
        <div className="upload-progress-bar">
          <div className="upload-progress-fill" style={{ width: `${editor.uploadProgress}%` }} />
        </div>
      )}

      <AppEditorWorkspace
        activePlayerSidebarSection={activePlayerSidebarSection}
        activeRightTab={activeRightTab}
        auth={auth}
        editor={editor}
        onClosePlayerSidebar={handleClosePlayerSidebar}
        onOpenExportConfig={handleOpenExportConfig}
        onOpenSceneBulkConfig={handleOpenSceneBulkConfig}
        onOpenSceneConfig={handleOpenSceneConfig}
        onOpenSubtitleConfig={handleOpenSubtitleConfig}
        onOpenVoiceoverAudioConfig={handleOpenVoiceoverAudioConfig}
        onRequireAuth={handleOpenAuthDialog}
        onSeek={handleSeek}
        onSetActiveRightTab={setActiveRightTab}
        onTogglePlayerSidebarSection={handleTogglePlayerSidebarSection}
        selectedSceneConfig={selectedSceneConfig}
        selectedSceneConfigIndex={selectedSceneConfigIndex}
      />
      {processingLockConfig && <ProcessingLockModal {...processingLockConfig} />}
      {authDialog}
      {creditDialog}
      {premiumDialog}
    </div>
  );
}

export default App;
