import { useCallback, useState, useEffect, useMemo } from 'react';
import './App.css';
import { useVideoEditor } from './hooks/useVideoEditor';
import { useAuthSession } from './hooks/useAuthSession';
import AuthDialog from './components/Auth/AuthDialog';
import AppHeader from './components/AppShell/AppHeader';
import AppEditorWorkspace from './components/AppShell/AppEditorWorkspace';
import AdminBootstrapSetup from './components/Admin/AdminBootstrapSetup';
import AdminConsole from './components/Admin/AdminConsole';
import ProjectDashboard from './components/ProjectDashboard/ProjectDashboard';

function App() {
  const editor = useVideoEditor();
  const auth = useAuthSession();
  const [activeRightTab, setActiveRightTab] = useState('scenes');
  const [activePlayerSidebarSection, setActivePlayerSidebarSection] = useState(null);
  const [selectedSceneConfigId, setSelectedSceneConfigId] = useState(null);
  const [isAdminConsoleOpen, setIsAdminConsoleOpen] = useState(false);
  const [isProjectBrowserOpen, setIsProjectBrowserOpen] = useState(false);
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
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

  const handleOpenAuthDialog = useCallback(() => {
    auth.clearError?.();
    setIsAuthDialogOpen(true);
  }, [auth]);

  const handleCloseAuthDialog = useCallback(() => {
    setIsAuthDialogOpen(false);
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
  const isAdminConsoleVisible = isAdminConsoleOpen && auth.isAdmin && !auth.requiresAdminSetup;

  if (auth.requiresAdminSetup) {
    return (
      <div className="app">
        <AppHeader
          auth={auth}
          locatorCode="header.admin-bootstrap"
          locatorTitle="Admin Bootstrap Header"
          onOpenAuthDialog={handleOpenAuthDialog}
          title="VideoForge Admin"
        />
        <AdminBootstrapSetup auth={auth} />
        {authDialog}
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
          title="VideoForge Admin"
        >
          <button className="btn btn-ghost btn-sm" type="button" onClick={handleCloseAdminConsole}>
            ← Studio
          </button>
        </AppHeader>
        <main className="app-main">
          <AdminConsole />
        </main>
        {authDialog}
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
          showPremiumButton
          showClientBadge
        />
        <main className="app-main">
          <div className="restore-loading">
            <div className="detecting-spinner" />
            <div style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>
              Loading project...
            </div>
          </div>
        </main>
        {authDialog}
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
          showPremiumButton
          showClientBadge
        />
        <main className="app-main">
          <ProjectDashboard
            onOpenProject={handleOpenProject}
            onNewProject={handleNewProject}
          />
        </main>
        {authDialog}
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
        showPremiumButton
      >
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
      {authDialog}
    </div>
  );
}

export default App;
