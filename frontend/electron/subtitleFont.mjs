import { readFile } from 'node:fs/promises'
import path from 'node:path'

function getFontCandidates() {
  if (process.platform === 'win32') {
    const fontsDir = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts')
    return [
      { filePath: path.join(fontsDir, 'arial.ttf'), familyName: 'Arial' },
      { filePath: path.join(fontsDir, 'segoeui.ttf'), familyName: 'Segoe UI' },
      { filePath: path.join(fontsDir, 'tahoma.ttf'), familyName: 'Tahoma' },
    ]
  }

  if (process.platform === 'darwin') {
    return [
      { filePath: '/System/Library/Fonts/Supplemental/Arial.ttf', familyName: 'Arial' },
      { filePath: '/System/Library/Fonts/Supplemental/Helvetica.ttc', familyName: 'Helvetica' },
    ]
  }

  return [
    { filePath: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', familyName: 'DejaVu Sans' },
    { filePath: '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf', familyName: 'Liberation Sans' },
  ]
}

async function readSubtitleFontAsset() {
  for (const candidate of getFontCandidates()) {
    try {
      const bytes = await readFile(candidate.filePath)
      return {
        bytes: new Uint8Array(bytes),
        familyName: candidate.familyName,
        fileName: path.basename(candidate.filePath),
      }
    } catch {
      // Try the next candidate font.
    }
  }

  throw new Error('No usable subtitle font file was found on this desktop runtime.')
}

export function registerSubtitleFontIpc(ipcMain) {
  ipcMain.handle('system-resources:get-subtitle-font', async () => readSubtitleFontAsset())
}