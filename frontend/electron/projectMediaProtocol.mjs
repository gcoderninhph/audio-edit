import { protocol } from 'electron'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { resolveProjectVideoPath } from './projectStore.mjs'

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
      },
    })
  }

  if (!byteRange) {
    const headers = {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Length': String(totalSize),
      'Content-Type': contentType,
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
  }

  if (request.method === 'HEAD') {
    return new Response(null, { status: 206, headers })
  }

  return new Response(Readable.toWeb(createReadStream(filePath, { start, end })), {
    status: 206,
    headers,
  })
}

export function registerProjectMediaProtocol({ getContentType }) {
  protocol.handle('project-media', async (request) => {
    try {
      const requestUrl = new URL(request.url)
      const pathSegments = requestUrl.pathname.split('/').filter(Boolean)
      const projectId = decodeURIComponent(pathSegments[0] || '')

      if (requestUrl.hostname !== 'project' || !projectId) {
        return buildProtocolErrorResponse('Invalid project media request.', 400)
      }

      const videoPath = await resolveProjectVideoPath(projectId)
      if (!videoPath) {
        return buildProtocolErrorResponse('Project video not found.', 404)
      }

      return buildProjectMediaResponse(videoPath, request, getContentType)
    } catch (error) {
      return buildProtocolErrorResponse(error.message, 500)
    }
  })
}