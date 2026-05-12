import { useCallback, useState } from 'react'
import { detectLargestFaceFromImageUrls } from '../utils/faceDetection'
import { generateThumbnail } from '../utils/sceneDetection'
import { normalizeSceneMotionConfig } from '../utils/sceneMotion'
import {
  SCENE_MOTION_BULK_CONDITIONS,
  SCENE_MOTION_BULK_OPERATORS,
  buildSceneMotionBulkActionConfig,
  doesSceneMotionDurationConditionMatch,
  isSceneMotionCenterTarget,
  isSceneMotionFaceCondition,
  normalizeSceneMotionBulkRules,
} from '../utils/sceneMotionBulkConfig'

function createCenterFaceFallback(message) {
  return {
    focusX: 0.5,
    focusY: 0.5,
    fallback: true,
    message,
  }
}

function countFaceTarget(summary, face) {
  if (face?.fallback) {
    summary.centerFallbackCount += 1
  } else {
    summary.detectedFaceCount += 1
  }
}

const FACE_DETECTION_SAMPLE_POINTS = Object.freeze([0.5, 0.35, 0.65, 0.2, 0.8])

function buildFaceDetectionSampleTimes(scene) {
  const start = Math.max(0, Number(scene?.start) || 0)
  const explicitDuration = Number(scene?.duration)
  const end = Number(scene?.end)
  const fallbackDuration = Number.isFinite(end) ? end - start : 0
  const duration = Math.max(0, Number.isFinite(explicitDuration) ? explicitDuration : fallbackDuration)
  if (duration <= 0) return [start]

  const sampleCount = duration < 1 ? 2 : duration < 3 ? 3 : FACE_DETECTION_SAMPLE_POINTS.length
  const margin = Math.min(0.25, duration * 0.1)
  const minTime = start + margin
  const maxTime = start + Math.max(margin, duration - margin)

  return [...new Set(FACE_DETECTION_SAMPLE_POINTS.slice(0, sampleCount).map((point) => {
    const sampleTime = start + (duration * point)
    return Number(Math.max(minTime, Math.min(maxTime, sampleTime)).toFixed(3))
  }))]
}

export function useSceneMotionConfig({
  clearExportResult,
  getCurrentSnapshot,
  pushState,
  scenes,
  setScenes,
  videoUrl,
}) {
  const [sceneBulkMotionRules, setSceneBulkMotionRulesState] = useState([])

  const setSceneBulkMotionRules = useCallback((nextRules) => {
    setSceneBulkMotionRulesState((currentRules) => normalizeSceneMotionBulkRules(
      typeof nextRules === 'function' ? nextRules(currentRules) : nextRules,
    ))
  }, [])

  const detectFaceTarget = useCallback(async (scene) => {
    try {
      if (!videoUrl) {
        throw new Error('Video preview is not ready for face detection.')
      }

      const frameUrls = []
      for (const sampleTime of buildFaceDetectionSampleTimes(scene)) {
        const frameUrl = await generateThumbnail(videoUrl, sampleTime, 768, 432)
        if (frameUrl) frameUrls.push(frameUrl)
      }

      if (frameUrls.length === 0) {
        throw new Error('Unable to capture a scene frame for face detection.')
      }

      return await detectLargestFaceFromImageUrls(frameUrls)
    } catch (error) {
      return createCenterFaceFallback(error?.message || 'Face detection failed. Center target will be used.')
    }
  }, [videoUrl])

  const setSceneMotionConfig = useCallback((sceneId, nextMotionConfig) => {
    pushState(getCurrentSnapshot())
    setScenes((currentScenes) => currentScenes.map((scene) => {
      if (scene.id !== sceneId) {
        return scene
      }

      const resolvedMotionConfig = typeof nextMotionConfig === 'function'
        ? nextMotionConfig(scene.motion)
        : nextMotionConfig

      return {
        ...scene,
        motion: normalizeSceneMotionConfig(resolvedMotionConfig),
      }
    }))
    clearExportResult()
  }, [clearExportResult, getCurrentSnapshot, pushState, setScenes])

  const detectSceneFace = useCallback(async (sceneId) => {
    const scene = scenes.find((candidate) => candidate.id === sceneId)
    if (!scene) {
      throw new Error('Scene was not found for face detection.')
    }

    const face = await detectFaceTarget(scene)

    setSceneMotionConfig(sceneId, (currentMotion) => ({
      ...normalizeSceneMotionConfig(currentMotion),
      focusX: face.focusX,
      focusY: face.focusY,
      detectionStatus: face.fallback ? 'center-fallback' : 'detected',
    }))

    return face
  }, [detectFaceTarget, scenes, setSceneMotionConfig])

  const applySceneMotionBulkConfig = useCallback(async ({ rules, sceneIds = [], onProgress } = {}) => {
    const normalizedRules = normalizeSceneMotionBulkRules(rules)
    const targetSceneIds = new Set(sceneIds)
    const candidates = scenes.filter((scene) => targetSceneIds.size === 0 || targetSceneIds.has(scene.id))
    const summary = {
      candidateCount: candidates.length,
      matchedCount: 0,
      detectedFaceCount: 0,
      centerFallbackCount: 0,
    }

    if (normalizedRules.length === 0 || candidates.length === 0) {
      return summary
    }

    const faceTargetsBySceneId = new Map()
    const getFaceTarget = async (scene) => {
      if (!faceTargetsBySceneId.has(scene.id)) {
        faceTargetsBySceneId.set(scene.id, await detectFaceTarget(scene))
      }

      return faceTargetsBySceneId.get(scene.id)
    }
    const nextMotionBySceneId = new Map()

    const evaluateCondition = async (scene, condition) => {
      if (isSceneMotionFaceCondition(condition)) {
        const face = await getFaceTarget(scene)
        return condition.type === SCENE_MOTION_BULK_CONDITIONS.FACE_DETECTED
          ? !face.fallback
          : Boolean(face.fallback)
      }

      return doesSceneMotionDurationConditionMatch(scene, condition)
    }

    for (const [index, scene] of candidates.entries()) {
      onProgress?.({ index: index + 1, total: candidates.length, scene })
      let matchingAction = null

      for (const rule of normalizedRules) {
        const conditionMatches = []
        for (const condition of rule.conditions) {
          conditionMatches.push(await evaluateCondition(scene, condition))
        }
        const isMatch = rule.operator === SCENE_MOTION_BULK_OPERATORS.OR
          ? conditionMatches.some(Boolean)
          : conditionMatches.every(Boolean)

        if (isMatch) {
          matchingAction = rule.action
        }
      }

      if (!matchingAction) {
        continue
      }

      const target = isSceneMotionCenterTarget(matchingAction)
        ? createCenterFaceFallback('Center target selected.')
        : await getFaceTarget(scene)
      nextMotionBySceneId.set(scene.id, buildSceneMotionBulkActionConfig(scene.motion, matchingAction, target))
      countFaceTarget(summary, target)
    }

    summary.matchedCount = nextMotionBySceneId.size
    if (nextMotionBySceneId.size === 0) {
      return summary
    }

    pushState(getCurrentSnapshot())
    setScenes((currentScenes) => currentScenes.map((scene) => (
      nextMotionBySceneId.has(scene.id)
        ? { ...scene, motion: nextMotionBySceneId.get(scene.id) }
        : scene
    )))
    clearExportResult()

    return summary
  }, [clearExportResult, detectFaceTarget, getCurrentSnapshot, pushState, scenes, setScenes])

  return {
    applySceneMotionBulkConfig,
    detectSceneFace,
    sceneBulkMotionRules,
    setSceneBulkMotionRules,
    setSceneMotionConfig,
  }
}
