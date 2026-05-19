export const WATERMARK_TEXT = 'G Studio'

const WATERMARK_SPEED = 0.32
const WATERMARK_INITIAL_POSITION = Object.freeze({ x: 0.16, y: 0.22 })
const WATERMARK_INITIAL_ANGLE = 0.66
const MAX_WATERMARK_SEGMENTS = 2000
const EPSILON = 0.000001

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number(value) || 0))
}

function lerp(start, end, progress) {
  return start + ((end - start) * progress)
}

function normalizeAngle(angle) {
  const fullTurn = Math.PI * 2
  const normalized = angle % fullTurn
  return normalized < 0 ? normalized + fullTurn : normalized
}

function reflectAngle(angle, hitX, hitY) {
  const velocityX = Math.cos(angle)
  const velocityY = Math.sin(angle)
  const reflectedX = hitX ? -velocityX : velocityX
  const reflectedY = hitY ? -velocityY : velocityY

  if (Math.abs(reflectedX) < EPSILON && Math.abs(reflectedY) < EPSILON) {
    return normalizeAngle(angle)
  }

  return normalizeAngle(Math.atan2(reflectedY, reflectedX))
}

function getNextSegment(state) {
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
      angle: reflectAngle(state.angle, hitX, hitY),
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
    const result = getNextSegment(state)
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