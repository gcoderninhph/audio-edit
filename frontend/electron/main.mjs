import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { appendDebugLog, getDebugLogFilePath, registerDebugLogIpc } from './debugLog.mjs'
import { registerNativeExportIpc } from './export/exportCoordinator.mjs'
import { registerExportOutputIpc } from './export/exportOutputIpc.mjs'
import { registerNarratorComposeIpc } from './narratorCompose.mjs'
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
const isDeveloper = false
const serverUrl = 'https://audio-test.accstore.pro.vn'
const sessionDataDir = path.join(app.getPath('userData'), 'session-data')

process.env.ELECTRON_IS_DEVELOPER = isDeveloper ? '1' : '0'
app.setPath('sessionData', sessionDataDir)
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
app.commandLine.appendSwitch('enable-experimental-web-platform-features')

const rendererDevUrl = process.env.ELECTRON_RENDERER_URL

function getCliOptionValue(names) {
  for (const arg of process.argv.slice(2)) {
    for (const name of names) {
      if (arg === name) {
        return '1'
      }

      const prefix = `${name}=`
      if (arg.startsWith(prefix)) {
        return arg.slice(prefix.length)
      }
    }
  }

  return ''
}

function parseExportBenchmarkOptions() {
  const benchmarkEnabled = Boolean(getCliOptionValue(['--export-benchmark']))
  const projectId = getCliOptionValue(['--export-benchmark-project-id', '--project-id'])

  if (!benchmarkEnabled && !projectId) {
    return null
  }

  if (!projectId) {
    throw new Error('Export benchmark mode requires --project-id=<project-id>.')
  }

  return {
    maxElapsedMs: Number(getCliOptionValue(['--export-benchmark-max-ms', '--max-ms'])) || 15000,
    outputDirectory: getCliOptionValue(['--export-benchmark-output-dir', '--output-dir']),
    projectId,
  }
}

const exportBenchmarkOptions = parseExportBenchmarkOptions()

function syncExportBenchmarkEnvironment() {
  if (!exportBenchmarkOptions) {
    return
  }

  if (!exportBenchmarkOptions.outputDirectory) {
    exportBenchmarkOptions.outputDirectory = path.join(app.getPath('temp'), 'audio-edit-export-benchmarks')
  }

  process.env.ELECTRON_EXPORT_BENCHMARK_PROJECT_ID = exportBenchmarkOptions.projectId
  process.env.ELECTRON_EXPORT_BENCHMARK_MAX_MS = String(exportBenchmarkOptions.maxElapsedMs)
  process.env.ELECTRON_EXPORT_BENCHMARK_OUTPUT_DIR = exportBenchmarkOptions.outputDirectory
}

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
let isExportRunning = false

ipcMain.handle('window-guard:set-export-running', (_event, isRunning) => {
  isExportRunning = Boolean(isRunning)
  return { isExportRunning }
})

registerProjectStoreIpc(ipcMain)
registerDebugLogIpc(ipcMain)
registerSubtitleFontIpc(ipcMain)
registerNativeExportIpc(ipcMain)
registerExportOutputIpc(ipcMain)
registerNarratorComposeIpc(ipcMain)

if (exportBenchmarkOptions) {
  ipcMain.handle('export-benchmark:complete', async (_event, payload = {}) => {
    const result = {
      type: 'export-benchmark',
      ...payload,
    }

    console.log(JSON.stringify(result, null, 2))
    logDesktopEvent('export-benchmark', payload.ok ? 'Export benchmark completed' : 'Export benchmark failed', result, payload.ok ? 'info' : 'error')
    process.exitCode = payload.ok ? 0 : 1
    setTimeout(() => app.quit(), 100)
    return { accepted: true }
  })
}

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
    isExportRunning = false
    mainWindow = null
  })

  mainWindow.on('close', (event) => {
    if (!isExportRunning) {
      return
    }

    event.preventDefault()
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['OK'],
      defaultId: 0,
      cancelId: 0,
      title: 'Export in progress',
      message: 'Cannot close while export is running.',
      detail: 'Please wait for the export process to finish before closing this window.',
    })
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logDesktopEvent('renderer', 'Renderer failed to load', { errorCode, errorDescription, validatedURL }, 'error')
  })
  mainWindow.webContents.on('console-message', (details) => {
    logDesktopEvent('renderer-console', 'Renderer console message', {
      level: details.level,
      line: details.lineNumber,
      message: details.message,
      sourceId: details.sourceId,
    }, details.level === 'error' || details.level === 'warning' ? 'error' : 'info')
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    isExportRunning = false
    logDesktopEvent('renderer', 'Renderer process gone', details, 'error')
  })
  mainWindow.webContents.on('did-finish-load', async () => {
    logDesktopEvent('renderer', 'Renderer finished load', { rendererStartUrl })
    try {
      const domState = await mainWindow.webContents.executeJavaScript(
        `(() => {
          const root = document.getElementById('root')
          return {
            bodyClassName: document.body?.className || '',
            bodyTextSample: (document.body?.innerText || '').trim().slice(0, 200),
            documentTitle: document.title,
            rootChildCount: root?.childElementCount || 0,
            rootHtmlSample: (root?.innerHTML || '').trim().slice(0, 200),
          }
        })()`,
        true,
      )
      logDesktopEvent('renderer', 'Renderer DOM snapshot after load', domState)
    } catch (error) {
      logDesktopEvent('renderer', 'Unable to capture renderer DOM snapshot', error, 'error')
    }
  })

  mainWindow.once('ready-to-show', () => {
    if (!exportBenchmarkOptions) {
      mainWindow?.show()
    }
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
  if (exportBenchmarkOptions) {
    logDesktopEvent('desktop-main', 'Export benchmark mode skips backend health gate', { serverUrl })
  } else {
    await waitForBackendReady()
    logDesktopEvent('desktop-main', 'Backend became ready', { serverUrl })
  }
  await createMainWindow()
}

function cleanupRuntime() {
  logDesktopEvent('desktop-main', 'Cleaning up desktop runtime')
}

app.on('before-quit', cleanupRuntime)

app.whenReady().then(async () => {
  try {
    syncExportBenchmarkEnvironment()
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