import { buildSubtitleCardLayout, renderSubtitleCardLayout } from './frameCanvasRenderer'
import { DEFAULT_SUBTITLE_FONT_FAMILY } from './subtitleRenderModel'

function createCanvasContext(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(width))
  canvas.height = Math.max(1, Math.ceil(height))
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas 2D context is unavailable for subtitle asset generation.')
  }

  return { canvas, context }
}

function canvasToPngBytes(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('Failed to encode subtitle overlay asset.'))
        return
      }

      resolve(new Uint8Array(await blob.arrayBuffer()))
    }, 'image/png')
  })
}

export async function buildSubtitleOverlayAssets(subtitles, framePreset, fontFamily = DEFAULT_SUBTITLE_FONT_FAMILY) {
  if (!Array.isArray(subtitles) || subtitles.length === 0) {
    return { assets: [], events: [] }
  }

  const measureCanvas = document.createElement('canvas')
  const measureContext = measureCanvas.getContext('2d')
  if (!measureContext) {
    return { assets: [], events: [] }
  }

  const assets = []
  const events = []
  const assetsByText = new Map()

  for (const subtitle of subtitles) {
    const text = String(subtitle?.text || '').trim()
    if (!text) {
      continue
    }

    let asset = assetsByText.get(text)
    if (!asset) {
      const layout = buildSubtitleCardLayout(measureContext, text, framePreset, fontFamily)
      if (!layout) {
        continue
      }

      const assetX = Math.round(layout.boxX)
      const assetY = Math.round(layout.boxY)
      const { canvas, context } = createCanvasContext(layout.boxWidth, layout.boxHeight)
      renderSubtitleCardLayout(context, layout, {
        offsetX: assetX,
        offsetY: assetY,
      })

      asset = {
        id: `subtitle-${assets.length}`,
        x: assetX,
        y: assetY,
        width: canvas.width,
        height: canvas.height,
        bytes: await canvasToPngBytes(canvas),
      }
      assetsByText.set(text, asset)
      assets.push(asset)
    }

    events.push({
      assetId: asset.id,
      start: Math.max(0, Number(subtitle.start) || 0),
      end: Math.max(0, Number(subtitle.end) || 0),
    })
  }

  return { assets, events }
}