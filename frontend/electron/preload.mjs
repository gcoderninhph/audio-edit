import { contextBridge, ipcRenderer } from 'electron'

const runtimeConfig = Object.freeze({
  isDesktop: true,
  serverUrl: process.env.ELECTRON_SERVER_URL || `http://127.0.0.1:${process.env.ELECTRON_SERVER_PORT || 5000}`,
})

contextBridge.exposeInMainWorld('desktopBridge', {
  getRuntimeConfig: () => runtimeConfig,
  projectStore: {
    saveVideoFile: (payload) => ipcRenderer.invoke('projects:save-video', payload),
    saveProject: (payload) => ipcRenderer.invoke('projects:save-project', payload),
    listProjects: () => ipcRenderer.invoke('projects:list'),
    getProject: (projectId) => ipcRenderer.invoke('projects:get', projectId),
    readProjectVideo: (projectId) => ipcRenderer.invoke('projects:read-video', projectId),
    deleteProject: (projectId) => ipcRenderer.invoke('projects:delete', projectId),
  },
})