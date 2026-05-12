import { SCENE_MOTION_MODES, normalizeSceneMotionConfig } from './sceneMotion'

export const SCENE_MOTION_BULK_CONDITIONS = Object.freeze({
  FACE_DETECTED: 'face-detected',
  FACE_MISSING: 'face-missing',
  DURATION_GREATER_THAN: 'duration-greater-than',
  DURATION_LESS_THAN: 'duration-less-than',
})

export const SCENE_MOTION_BULK_TARGETS = Object.freeze({
  FACE_OR_CENTER: 'face-or-center',
  CENTER: 'center',
})

export const SCENE_MOTION_BULK_OPERATORS = Object.freeze({
  AND: 'and',
  OR: 'or',
})

export const DEFAULT_SCENE_MOTION_BULK_SECONDS = 3

const VALID_CONDITION_TYPES = new Set(Object.values(SCENE_MOTION_BULK_CONDITIONS))
const VALID_TARGETS = new Set(Object.values(SCENE_MOTION_BULK_TARGETS))
const VALID_OPERATORS = new Set(Object.values(SCENE_MOTION_BULK_OPERATORS))

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalizeSeconds(value) {
  const seconds = Number.isFinite(Number(value)) ? Number(value) : DEFAULT_SCENE_MOTION_BULK_SECONDS
  return clamp(seconds, 0, 999)
}

function normalizeCondition(condition = {}) {
  const type = VALID_CONDITION_TYPES.has(condition.type)
    ? condition.type
    : SCENE_MOTION_BULK_CONDITIONS.FACE_DETECTED

  return {
    type,
    seconds: normalizeSeconds(condition.seconds),
  }
}

function normalizeTarget(target) {
  return VALID_TARGETS.has(target) ? target : SCENE_MOTION_BULK_TARGETS.FACE_OR_CENTER
}

function normalizeOperator(operator) {
  return VALID_OPERATORS.has(operator) ? operator : SCENE_MOTION_BULK_OPERATORS.AND
}

function normalizeConditions(rule = {}) {
  const conditions = Array.isArray(rule.conditions) && rule.conditions.length > 0
    ? rule.conditions
    : [rule.condition].filter(Boolean)

  return (conditions.length > 0 ? conditions : [createDefaultSceneMotionBulkCondition()]).map(normalizeCondition)
}

function normalizeAction(action = {}) {
  const motionConfig = normalizeSceneMotionConfig({
    mode: action.mode || SCENE_MOTION_MODES.ANIMATION_ZOOM_IN,
    zoomScale: action.zoomScale,
  })

  return {
    mode: motionConfig.mode,
    zoomScale: motionConfig.zoomScale,
    target: normalizeTarget(action.target),
  }
}

export function createDefaultSceneMotionBulkCondition() {
  return {
    type: SCENE_MOTION_BULK_CONDITIONS.FACE_DETECTED,
    seconds: DEFAULT_SCENE_MOTION_BULK_SECONDS,
  }
}

export function createDefaultSceneMotionBulkRule(id = '') {
  return {
    id,
    operator: SCENE_MOTION_BULK_OPERATORS.AND,
    conditions: [createDefaultSceneMotionBulkCondition()],
    action: {
      mode: SCENE_MOTION_MODES.ANIMATION_ZOOM_IN,
      zoomScale: 1.18,
      target: SCENE_MOTION_BULK_TARGETS.FACE_OR_CENTER,
    },
  }
}

export function normalizeSceneMotionBulkRule(rule = {}) {
  const fallbackRule = createDefaultSceneMotionBulkRule()
  return {
    id: String(rule.id || fallbackRule.id),
    operator: normalizeOperator(rule.operator || fallbackRule.operator),
    conditions: normalizeConditions(rule),
    action: normalizeAction(rule.action || fallbackRule.action),
  }
}

export function normalizeSceneMotionBulkRules(rules = []) {
  return (Array.isArray(rules) ? rules : []).map(normalizeSceneMotionBulkRule)
}

export function isSceneMotionFaceCondition(condition) {
  return condition?.type === SCENE_MOTION_BULK_CONDITIONS.FACE_DETECTED
    || condition?.type === SCENE_MOTION_BULK_CONDITIONS.FACE_MISSING
}

export function isSceneMotionCenterTarget(action) {
  return action?.target === SCENE_MOTION_BULK_TARGETS.CENTER
}

export function doesSceneMotionDurationConditionMatch(scene, condition) {
  const duration = Math.max(0, Number(scene?.duration) || 0)
  const seconds = normalizeSeconds(condition?.seconds)

  if (condition?.type === SCENE_MOTION_BULK_CONDITIONS.DURATION_GREATER_THAN) {
    return duration > seconds
  }

  if (condition?.type === SCENE_MOTION_BULK_CONDITIONS.DURATION_LESS_THAN) {
    return duration < seconds
  }

  return false
}

export function buildSceneMotionBulkActionConfig(currentMotion, action, target) {
  const normalizedAction = normalizeAction(action)
  return normalizeSceneMotionConfig({
    ...normalizeSceneMotionConfig(currentMotion),
    mode: normalizedAction.mode,
    zoomScale: normalizedAction.zoomScale,
    focusX: target?.focusX ?? 0.5,
    focusY: target?.focusY ?? 0.5,
    detectionStatus: target?.fallback ? 'center-fallback' : 'detected',
  })
}