import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { appendDebugLog, getDebugLogFilePath, registerDebugLogIpc } from './debugLog.mjs'
import { registerNativeExportIpc } from './export/exportCoordinator.mjs'
import { registerExportOutputIpc } from './export/exportOutputIpc.mjs'
import { registerDesktopAppProtocol } from './projectMediaProtocol.mjs'
import { registerProjectStoreIpc } from './projectStore.mjs'
import { registerSubtitleFontIpc } from './subtitleFont.mjs'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'desktop',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
])

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const frontendDir = path.resolve(__dirname, '..')
const distDir = path.join(frontendDir, 'dist')
const isDeveloper = true
const serverUrl = 'https://audio-test.accstore.pro.vn'

process.env.ELECTRON_IS_DEVELOPER = isDeveloper ? '1' : '0'
app.commandLine.appendSwitch('enable-experimental-web-platform-features')

const rendererDevUrl = process.env.ELECTRON_RENDERER_URL

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.m4v', 'video/mp4'],
  ['.mov', 'video/quicktime'],
  ['.mp4', 'video/mp4'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wasm', 'application/wasm'],
  ['.webm', 'video/webm'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

let mainWindow = null
let rendererStartUrl = null

registerProjectStoreIpc(ipcMain)
registerDebugLogIpc(ipcMain)
registerSubtitleFontIpc(ipcMain)
registerNativeExportIpc(ipcMain)
registerExportOutputIpc(ipcMain)

function logDesktopEvent(scope, message, data = {}, level = 'info') {
  void appendDebugLog({ scope, message, data, level })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getContentType(filePath) {
  return mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream'
}

async function waitForBackendReady() {
  const healthUrl = `${serverUrl}/api/health`
  let lastError = null

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(healthUrl)
      if (response.ok) {
        return
      }
      lastError = new Error(`Backend responded with status ${response.status}`)
    } catch (error) {
      lastError = error
    }

    await delay(500)
  }

  throw lastError || new Error('Timed out waiting for the Flask backend to become ready.')
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    autoHideMenuBar: true,
    backgroundColor: '#101317',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logDesktopEvent('renderer', 'Renderer failed to load', { errorCode, errorDescription, validatedURL }, 'error')
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logDesktopEvent('renderer', 'Renderer process gone', details, 'error')
  })
  mainWindow.webContents.on('did-finish-load', () => {
    logDesktopEvent('renderer', 'Renderer finished load', { rendererStartUrl })
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  await mainWindow.loadURL(rendererStartUrl)
}

async function bootstrapDesktopApp() {
  logDesktopEvent('desktop-main', 'Desktop bootstrap started', {
    isDeveloper,
    logFilePath: getDebugLogFilePath(),
    rendererDevUrl: rendererDevUrl || null,
    serverUrl,
  })
  registerDesktopAppProtocol({ distDir, getContentType })
  rendererStartUrl = rendererDevUrl || 'desktop://app/index.html'
  await waitForBackendReady()
  logDesktopEvent('desktop-main', 'Backend became ready', { serverUrl })
  await createMainWindow()
}

function cleanupRuntime() {
  logDesktopEvent('desktop-main', 'Cleaning up desktop runtime')
}

app.on('before-quit', cleanupRuntime)

app.whenReady().then(async () => {
  try {
    await bootstrapDesktopApp()
  } catch (error) {
    logDesktopEvent('desktop-main', 'Desktop startup failed', error, 'error')
    dialog.showErrorBox('Desktop startup failed', error.message)
    app.quit()
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0 && rendererStartUrl) {
      await createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})