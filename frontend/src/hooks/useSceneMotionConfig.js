import { useCallback } from 'react'
import { detectLargestFaceFromImageUrl } from '../utils/faceDetection'
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

export function useSceneMotionConfig({
  clearExportResult,
  getCurrentSnapshot,
  pushState,
  scenes,
  setScenes,
  videoUrl,
}) {
  const detectFaceTarget = useCallback(async (scene) => {
    try {
      if (!videoUrl) {
        throw new Error('Video preview is not ready for face detection.')
      }

      const midpoint = scene.start + (scene.duration / 2)
      const frameUrl = await generateThumbnail(videoUrl, midpoint, 384, 216)
      if (!frameUrl) {
        throw new Error('Unable to capture a scene frame for face detection.')
      }

      return await detectLargestFaceFromImageUrl(frameUrl)
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
    setSceneMotionConfig,
  }
}
