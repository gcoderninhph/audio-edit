import { protocol } from 'electron'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import path from 'node:path'
import { resolveProjectSceneGridPath, resolveProjectVideoPath } from './projectStore.mjs'

const rendererHeaders = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

const mediaHeaders = {
  'Cross-Origin-Resource-Policy': 'cross-origin',
}

function buildProtocolErrorResponse(message, status) {
  return new Response(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}

function parseByteRange(rangeHeader, totalSize) {
  if (!rangeHeader) {
    return null
  }

  const rangeMatch = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim())
  if (!rangeMatch) {
    return null
  }

  const [, startToken, endToken] = rangeMatch
  let start = startToken === '' ? null : Number(startToken)
  let end = endToken === '' ? null : Number(endToken)

  if (
    (start !== null && !Number.isInteger(start))
    || (end !== null && !Number.isInteger(end))
  ) {
    return null
  }

  if (start === null && end === null) {
    return null
  }

  if (start === null) {
    const suffixLength = end
    if (suffixLength === null || suffixLength <= 0) {
      return null
    }

    start = Math.max(totalSize - suffixLength, 0)
    end = totalSize - 1
  } else {
    if (start < 0 || start >= totalSize) {
      return null
    }

    if (end === null || end >= totalSize) {
      end = totalSize - 1
    }
  }

  if (end < start) {
    return null
  }

  return { start, end }
}

async function buildProjectMediaResponse(filePath, request, getContentType) {
  const fileStats = await stat(filePath)
  const totalSize = fileStats.size
  const contentType = getContentType(filePath)
  const rangeHeader = request.headers.get('range')
  const byteRange = parseByteRange(rangeHeader, totalSize)

  if (rangeHeader && !byteRange) {
    return new Response(null, {
      status: 416,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes */${totalSize}`,
        'Content-Type': contentType,
        ...mediaHeaders,
      },
    })
  }

  if (!byteRange) {
    const headers = {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Length': String(totalSize),
      'Content-Type': contentType,
      ...mediaHeaders,
    }

    if (request.method === 'HEAD') {
      return new Response(null, { status: 200, headers })
    }

    return new Response(Readable.toWeb(createReadStream(filePath)), {
      status: 200,
      headers,
    })
  }

  const { start, end } = byteRange
  const chunkSize = end - start + 1
  const headers = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Content-Length': String(chunkSize),
    'Content-Range': `bytes ${start}-${end}/${totalSize}`,
    'Content-Type': contentType,
    ...mediaHeaders,
  }

  if (request.method === 'HEAD') {
    return new Response(null, { status: 206, headers })
  }

  return new Response(Readable.toWeb(createReadStream(filePath, { start, end })), {
    status: 206,
    headers,
  })
}

async function fileExists(filePath) {
  try {
    const fileStats = await stat(filePath)
    return fileStats.isFile()
  } catch {
    return false
  }
}

async function resolveRendererTarget(distDir, requestPath) {
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\//, '')
  const resolvedPath = path.resolve(distDir, relativePath)

  if (!resolvedPath.startsWith(distDir)) {
    return null
  }

  if (await fileExists(resolvedPath)) {
    return resolvedPath
  }

  return path.join(distDir, 'index.html')
}

async function buildRendererResponse(filePath, request, getContentType) {
  const content = await readFile(filePath)
  const headers = {
    ...rendererHeaders,
    'Content-Type': getContentType(filePath),
  }

  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers })
  }

  return new Response(content, {
    status: 200,
    headers,
  })
}

export function registerDesktopAppProtocol({ distDir, getContentType }) {
  protocol.handle('desktop', async (request) => {
    try {
      const requestUrl = new URL(request.url)
      if (requestUrl.hostname !== 'app') {
        return buildProtocolErrorResponse('Invalid project media request.', 400)
      }

      const requestPath = decodeURIComponent(requestUrl.pathname || '/')
      if (requestPath.startsWith('/project-media/')) {
        const mediaPath = requestPath.slice('/project-media/'.length)
        const [projectId, ...assetSegments] = mediaPath.split('/').filter(Boolean)
        if (!projectId) {
          return buildProtocolErrorResponse('Invalid project media request.', 400)
        }

        const requestedAsset = assetSegments.join('/')
        if (!requestedAsset) {
          const videoPath = await resolveProjectVideoPath(projectId)
          if (!videoPath) {
            return buildProtocolErrorResponse('Project video not found.', 404)
          }

          return buildProjectMediaResponse(videoPath, request, getContentType)
        }

        if (requestedAsset === 'scene-grid.png') {
          const sceneGridPath = await resolveProjectSceneGridPath(projectId)
          if (!sceneGridPath) {
            return buildProtocolErrorResponse('Scene grid image not found.', 404)
          }

          return buildProjectMediaResponse(sceneGridPath, request, getContentType)
        }

        return buildProtocolErrorResponse('Project media asset not found.', 404)
      }

      const targetPath = await resolveRendererTarget(distDir, requestPath)
      if (!targetPath) {
        return buildProtocolErrorResponse('Forbidden', 403)
      }

      return buildRendererResponse(targetPath, request, getContentType)
    } catch (error) {
      return buildProtocolErrorResponse(error.message, 500)
    }
  })
}