import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron'
import { spawn } from 'node:child_process'
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
const workspaceDir = path.resolve(frontendDir, '..')
const serverDir = path.join(workspaceDir, 'server')
const distDir = path.join(frontendDir, 'dist')
const isDeveloper = true

process.env.ELECTRON_IS_DEVELOPER = isDeveloper ? '1' : '0'

const serverPort = Number(process.env.ELECTRON_SERVER_PORT || 5000)
const serverUrl = process.env.ELECTRON_SERVER_URL || `http://127.0.0.1:${serverPort}`
const rendererDevUrl = process.env.ELECTRON_RENDERER_URL
const shouldSpawnBackend = process.env.ELECTRON_SKIP_BACKEND !== '1'

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

let backendProcess = null
let mainWindow = null
let rendererStartUrl = null
let isQuitting = false

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

function getPythonCommand() {
  return process.env.PYTHON_BIN || 'python'
}

function getContentType(filePath) {
  return mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream'
}

function logBackendOutput(prefix, data) {
  const output = data.toString().trim()
  if (output) {
    console.log(`${prefix} ${output}`)
    logDesktopEvent('backend', output, { prefix })
  }
}

function startBackendProcess() {
  if (!shouldSpawnBackend || backendProcess) {
    return
  }

  backendProcess = spawn(getPythonCommand(), ['app.py'], {
    cwd: serverDir,
    env: {
      ...process.env,
      FLASK_DEBUG: '0',
      FLASK_USE_RELOADER: '0',
      PYTHONUNBUFFERED: '1',
      SERVER_PORT: String(serverPort),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  logDesktopEvent('backend', 'Spawned Flask backend process', {
    serverDir,
    serverPort,
  })

  backendProcess.stdout.on('data', (data) => logBackendOutput('[flask]', data))
  backendProcess.stderr.on('data', (data) => logBackendOutput('[flask:error]', data))
  backendProcess.on('error', (error) => {
    logDesktopEvent('backend', 'Backend startup failed', error, 'error')
    dialog.showErrorBox('Backend startup failed', error.message)
  })
  backendProcess.on('exit', (code, signal) => {
    backendProcess = null
    if (isQuitting) {
      return
    }

    const reason = signal ? `signal ${signal}` : `code ${code}`
    logDesktopEvent('backend', 'Backend stopped unexpectedly', { code, signal, reason }, 'error')
    dialog.showErrorBox('Backend stopped unexpectedly', `The Flask server exited with ${reason}.`)
    app.quit()
  })
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
  startBackendProcess()
  await waitForBackendReady()
  logDesktopEvent('desktop-main', 'Backend became ready', { serverUrl })
  await createMainWindow()
}

function cleanupRuntime() {
  isQuitting = true
  logDesktopEvent('desktop-main', 'Cleaning up desktop runtime')

  if (backendProcess) {
    backendProcess.kill()
    backendProcess = null
  }
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