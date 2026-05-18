export const WATERMARK_TEXT = 'G Studio'

const WATERMARK_SPEED = 0.32
const WATERMARK_INITIAL_POSITION = Object.freeze({ x: 0.16, y: 0.22 })
const WATERMARK_INITIAL_ANGLE = 0.66
const MAX_WATERMARK_SEGMENTS = 2000
const MIN_BOUNCE_ANGLE = Math.PI / 9
const EPSILON = 0.000001

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number(value) || 0))
}

function pseudoRandom(seed) {
  const raw = Math.sin((seed + 1) * 12.9898) * 43758.5453
  return raw - Math.floor(raw)
}

function lerp(start, end, progress) {
  return start + ((end - start) * progress)
}

function chooseBetween(startAngle, endAngle, seed) {
  return startAngle + ((endAngle - startAngle) * pseudoRandom(seed))
}

function chooseBounceAngle(edge, index) {
  const seed = index + (edge.includes('right') ? 17 : 0) + (edge.includes('bottom') ? 31 : 0)
  const min = MIN_BOUNCE_ANGLE
  const max = (Math.PI / 2) - MIN_BOUNCE_ANGLE

  if (edge === 'top-left') return chooseBetween(min, max, seed)
  if (edge === 'top-right') return chooseBetween(Math.PI - max, Math.PI - min, seed)
  if (edge === 'bottom-left') return chooseBetween(-max, -min, seed)
  if (edge === 'bottom-right') return chooseBetween(Math.PI + min, Math.PI + max, seed)
  if (edge === 'left') return chooseBetween(-max, max, seed)
  if (edge === 'right') return chooseBetween(Math.PI - max, Math.PI + max, seed)
  if (edge === 'top') return chooseBetween(min, Math.PI - min, seed)
  return chooseBetween(Math.PI + min, (Math.PI * 2) - min, seed)
}

function getEdgeName(x, y, hitX, hitY) {
  if (hitX && hitY) {
    const horizontal = x <= EPSILON ? 'left' : 'right'
    const vertical = y <= EPSILON ? 'top' : 'bottom'
    return `${vertical}-${horizontal}`
  }
  if (hitX) return x <= EPSILON ? 'left' : 'right'
  return y <= EPSILON ? 'top' : 'bottom'
}

function getNextSegment(state, index) {
  const vx = Math.cos(state.angle) * WATERMARK_SPEED
  const vy = Math.sin(state.angle) * WATERMARK_SPEED
  const timeToX = vx > EPSILON
    ? (1 - state.x) / vx
    : vx < -EPSILON
      ? -state.x / vx
      : Number.POSITIVE_INFINITY
  const timeToY = vy > EPSILON
    ? (1 - state.y) / vy
    : vy < -EPSILON
      ? -state.y / vy
      : Number.POSITIVE_INFINITY
  const duration = Math.max(0.05, Math.min(timeToX, timeToY))
  const nextX = clamp(state.x + (vx * duration))
  const nextY = clamp(state.y + (vy * duration))
  const hitX = Math.abs(duration - timeToX) < 0.001
  const hitY = Math.abs(duration - timeToY) < 0.001

  return {
    segment: {
      start: state.time,
      end: state.time + duration,
      startX: state.x,
      startY: state.y,
      endX: nextX,
      endY: nextY,
    },
    nextState: {
      time: state.time + duration,
      x: nextX,
      y: nextY,
      angle: chooseBounceAngle(getEdgeName(nextX, nextY, hitX, hitY), index),
    },
  }
}

function buildSegmentsUntil(endTime) {
  const segments = []
  let state = {
    time: 0,
    x: WATERMARK_INITIAL_POSITION.x,
    y: WATERMARK_INITIAL_POSITION.y,
    angle: WATERMARK_INITIAL_ANGLE,
  }

  for (let index = 0; state.time < endTime && index < MAX_WATERMARK_SEGMENTS; index += 1) {
    const result = getNextSegment(state, index)
    segments.push(result.segment)
    state = result.nextState
  }

  return segments
}

function getSegmentPosition(segment, time) {
  const duration = Math.max(EPSILON, segment.end - segment.start)
  const progress = clamp((time - segment.start) / duration)
  return {
    x: lerp(segment.startX, segment.endX, progress),
    y: lerp(segment.startY, segment.endY, progress),
  }
}

export function getWatermarkPositionAtTime(time) {
  const safeTime = Math.max(0, Number(time) || 0)
  const segments = buildSegmentsUntil(safeTime + EPSILON)
  const segment = segments.find((candidate) => safeTime >= candidate.start && safeTime <= candidate.end) || segments.at(-1)
  return segment ? getSegmentPosition(segment, safeTime) : { ...WATERMARK_INITIAL_POSITION }
}

export function buildWatermarkMotionSegments(startTime = 0, duration = 0) {
  const safeStart = Math.max(0, Number(startTime) || 0)
  const safeEnd = safeStart + Math.max(0, Number(duration) || 0)
  if (safeEnd <= safeStart) {
    return []
  }

  return buildSegmentsUntil(safeEnd + EPSILON)
    .map((segment) => {
      const clippedStart = Math.max(safeStart, segment.start)
      const clippedEnd = Math.min(safeEnd, segment.end)
      if (clippedEnd <= clippedStart) {
        return null
      }

      const startPosition = getSegmentPosition(segment, clippedStart)
      const endPosition = getSegmentPosition(segment, clippedEnd)
      return {
        start: clippedStart - safeStart,
        end: clippedEnd - safeStart,
        startX: startPosition.x,
        startY: startPosition.y,
        endX: endPosition.x,
        endY: endPosition.y,
      }
    })
    .filter(Boolean)
}