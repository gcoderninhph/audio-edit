import { contextBridge, ipcRenderer } from 'electron'

const serverUrl = 'https://audio-test.accstore.pro.vn'

const runtimeConfig = Object.freeze({
  isDesktop: true,
  isDeveloper: process.env.ELECTRON_IS_DEVELOPER === '1',
  serverUrl,
})

contextBridge.exposeInMainWorld('desktopBridge', {
  getRuntimeConfig: () => runtimeConfig,
  debugLog: {
    write: (entry) => ipcRenderer.invoke('debug-log:write', entry),
    getPath: () => ipcRenderer.invoke('debug-log:path'),
    tail: (maxLines) => ipcRenderer.invoke('debug-log:tail', maxLines),
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
  exportOutput: {
    getDefaultDirectory: () => ipcRenderer.invoke('export-output:get-default-directory'),
    chooseDirectory: () => ipcRenderer.invoke('export-output:choose-directory'),
    saveBytes: (payload) => ipcRenderer.invoke('export-output:save-bytes', payload),
    revealFile: (filePath) => ipcRenderer.invoke('export-output:reveal-file', filePath),
  },
  systemResources: {
    getSubtitleFont: () => ipcRenderer.invoke('system-resources:get-subtitle-font'),
  },
  projectStore: {
    saveVideoFile: (payload) => ipcRenderer.invoke('projects:save-video', payload),
    saveVoiceoverFile: (payload) => ipcRenderer.invoke('projects:save-voiceover', payload),
    saveProject: (payload) => ipcRenderer.invoke('projects:save-project', payload),
    listProjects: () => ipcRenderer.invoke('projects:list'),
    getProject: (projectId) => ipcRenderer.invoke('projects:get', projectId),
    getProjectVideo: (projectId) => ipcRenderer.invoke('projects:get-video', projectId),
    readProjectVideoBytes: (projectId) => ipcRenderer.invoke('projects:read-video-bytes', projectId),
    getProjectVoiceover: (projectId) => ipcRenderer.invoke('projects:get-voiceover', projectId),
    readProjectVoiceoverBytes: (projectId) => ipcRenderer.invoke('projects:read-voiceover-bytes', projectId),
    deleteProject: (projectId) => ipcRenderer.invoke('projects:delete', projectId),
  },
})