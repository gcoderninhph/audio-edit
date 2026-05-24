import { contextBridge, ipcRenderer } from 'electron'

const serverUrl = 'https://audio-test.accstore.pro.vn'

const runtimeConfig = Object.freeze({
  isDesktop: true,
  isDeveloper: process.env.ELECTRON_IS_DEVELOPER === '1',
  exportBenchmark: process.env.ELECTRON_EXPORT_BENCHMARK_PROJECT_ID
    ? Object.freeze({
      enabled: true,
      maxElapsedMs: Number(process.env.ELECTRON_EXPORT_BENCHMARK_MAX_MS) || 15000,
      outputDirectory: process.env.ELECTRON_EXPORT_BENCHMARK_OUTPUT_DIR || '',
      projectId: process.env.ELECTRON_EXPORT_BENCHMARK_PROJECT_ID,
    })
    : null,
  serverUrl,
})

contextBridge.exposeInMainWorld('desktopBridge', {
  getRuntimeConfig: () => runtimeConfig,
  debugLog: {
    write: (entry) => ipcRenderer.invoke('debug-log:write', entry),
    getPath: () => ipcRenderer.invoke('debug-log:path'),
    tail: (maxLines) => ipcRenderer.invoke('debug-log:tail', maxLines),
  },
  exportBenchmark: {
    complete: (payload) => ipcRenderer.invoke('export-benchmark:complete', payload),
  },
  nativeExport: {
    run: (payload) => ipcRenderer.invoke('native-export:run', payload),
    onProgress: (listener) => {
      const wrappedListener = (_event, payload) => listener(payload)
      ipcRenderer.on('native-export:progress', wrappedListener)

      return () => {
        ipcRenderer.off('native-export:progress', wrappedListener)
      }
    },
  },
  narratorCompose: {
    compose: (payload) => ipcRenderer.invoke('narrator-compose:compose', payload),
    downloadAudio: (payload) => ipcRenderer.invoke('narrator-compose:download-audio', payload),
  },
  exportOutput: {
    getDefaultDirectory: () => ipcRenderer.invoke('export-output:get-default-directory'),
    chooseDirectory: () => ipcRenderer.invoke('export-output:choose-directory'),
    saveBytes: (payload) => ipcRenderer.invoke('export-output:save-bytes', payload),
    revealFile: (filePath) => ipcRenderer.invoke('export-output:reveal-file', filePath),
  },
  windowGuard: {
    setExportRunning: (isRunning) => ipcRenderer.invoke('window-guard:set-export-running', Boolean(isRunning)),
  },
  systemResources: {
    getSubtitleFont: () => ipcRenderer.invoke('system-resources:get-subtitle-font'),
  },
  projectStore: {
    saveVideoFile: (payload) => ipcRenderer.invoke('projects:save-video', payload),
    saveVoiceoverFile: (payload) => ipcRenderer.invoke('projects:save-voiceover', payload),
    saveSceneGrid: (payload) => ipcRenderer.invoke('projects:save-scene-grid', payload),
    saveProject: (payload) => ipcRenderer.invoke('projects:save-project', payload),
    listProjects: () => ipcRenderer.invoke('projects:list'),
    getProject: (projectId) => ipcRenderer.invoke('projects:get', projectId),
    getProjectVideo: (projectId) => ipcRenderer.invoke('projects:get-video', projectId),
    getProjectSceneGrid: (projectId) => ipcRenderer.invoke('projects:get-scene-grid', projectId),
    readProjectVideoBytes: (projectId) => ipcRenderer.invoke('projects:read-video-bytes', projectId),
    getProjectVoiceover: (projectId) => ipcRenderer.invoke('projects:get-voiceover', projectId),
    readProjectVoiceoverBytes: (projectId) => ipcRenderer.invoke('projects:read-voiceover-bytes', projectId),
    deleteProject: (projectId) => ipcRenderer.invoke('projects:delete', projectId),
  },
})