const SUBTITLE_FONT_DIR = '/subtitle-fonts'

function normalizeBinaryPayload(bytes) {
  if (!bytes) {
    return null
  }

  if (bytes instanceof Uint8Array) {
    return bytes
  }

  if (bytes instanceof ArrayBuffer) {
    return new Uint8Array(bytes)
  }

  if (ArrayBuffer.isView(bytes)) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  if (Array.isArray(bytes)) {
    return Uint8Array.from(bytes)
  }

  return null
}

async function getSubtitleFontAsset() {
  return window.desktopBridge?.systemResources?.getSubtitleFont?.() || null
}

export async function ensureSubtitleFontAsset(ffmpeg) {
  const fontAsset = await getSubtitleFontAsset()
  const fontBytes = normalizeBinaryPayload(fontAsset?.bytes)

  if (!fontAsset?.fileName || !fontBytes) {
    return null
  }

  const fontPath = `${SUBTITLE_FONT_DIR}/${fontAsset.fileName}`

  try {
    await ffmpeg.createDir(SUBTITLE_FONT_DIR)
  } catch {
    // Reuse the existing subtitle font directory across exports.
  }

  try {
    await ffmpeg.deleteFile(fontPath)
  } catch {
    // Ignore the first write when the font file does not exist yet.
  }

  await ffmpeg.writeFile(fontPath, fontBytes)

  return {
    fontDir: SUBTITLE_FONT_DIR,
    fontFamily: fontAsset.familyName || 'Arial',
    fontPath,
  }
}