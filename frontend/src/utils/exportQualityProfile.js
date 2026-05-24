export const EXPORT_QUALITY_PROFILE_OPTIONS = Object.freeze([
  {
    id: 'draft-smallest',
    label: 'Draft smallest',
    helper: 'Uses the heaviest compression for preview or draft deliveries when file size matters more than sharpness.',
    labelKey: 'panel.videoPlayer.exportControls.qualityProfiles.draftSmallest.label',
    helperKey: 'panel.videoPlayer.exportControls.qualityProfiles.draftSmallest.helper',
    recorderVideoBitsPerSecond: 3_000_000,
    fallbackMuxPreset: 'veryfast',
    fallbackMuxCrf: 34,
    nativeCpuPreset: 'veryfast',
    nativeCpuCrf: 31,
    nativeNvencPreset: 'p6',
    nativeNvencCq: 32,
    nativeQsvPreset: 'faster',
    nativeQsvGlobalQuality: 33,
    nativeAmfQuality: 'quality',
  },
  {
    id: 'maximum-compression',
    label: 'Maximum compression',
    helper: 'Targets the smallest export size and may visibly soften fine detail.',
    labelKey: 'panel.videoPlayer.exportControls.qualityProfiles.maximumCompression.label',
    helperKey: 'panel.videoPlayer.exportControls.qualityProfiles.maximumCompression.helper',
    recorderVideoBitsPerSecond: 5_000_000,
    fallbackMuxPreset: 'veryfast',
    fallbackMuxCrf: 30,
    nativeCpuPreset: 'veryfast',
    nativeCpuCrf: 27,
    nativeNvencPreset: 'p5',
    nativeNvencCq: 28,
    nativeQsvPreset: 'faster',
    nativeQsvGlobalQuality: 29,
    nativeAmfQuality: 'quality',
  },
  {
    id: 'smaller-file',
    label: 'Smaller file',
    helper: 'Adds more compression to reduce the final file size with a moderate quality tradeoff.',
    labelKey: 'panel.videoPlayer.exportControls.qualityProfiles.smallerFile.label',
    helperKey: 'panel.videoPlayer.exportControls.qualityProfiles.smallerFile.helper',
    recorderVideoBitsPerSecond: 7_000_000,
    fallbackMuxPreset: 'superfast',
    fallbackMuxCrf: 27,
    nativeCpuPreset: 'superfast',
    nativeCpuCrf: 24,
    nativeNvencPreset: 'p4',
    nativeNvencCq: 25,
    nativeQsvPreset: 'faster',
    nativeQsvGlobalQuality: 26,
    nativeAmfQuality: 'balanced',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    helper: 'Keeps the current default balance of quality, file size, and export speed.',
    labelKey: 'panel.videoPlayer.exportControls.qualityProfiles.balanced.label',
    helperKey: 'panel.videoPlayer.exportControls.qualityProfiles.balanced.helper',
    recorderVideoBitsPerSecond: 10_000_000,
    fallbackMuxPreset: 'ultrafast',
    fallbackMuxCrf: 23,
    nativeCpuPreset: 'superfast',
    nativeCpuCrf: 20,
    nativeNvencPreset: 'p3',
    nativeNvencCq: 21,
    nativeQsvPreset: 'veryfast',
    nativeQsvGlobalQuality: 22,
    nativeAmfQuality: 'speed',
  },
])

export const DEFAULT_EXPORT_QUALITY_PROFILE_ID = 'balanced'

export function getExportQualityProfileById(profileId) {
  return EXPORT_QUALITY_PROFILE_OPTIONS.find((profile) => profile.id === profileId) || EXPORT_QUALITY_PROFILE_OPTIONS[0]
}

export function normalizeExportQualityProfileId(profileId) {
  return getExportQualityProfileById(profileId).id
}

export function serializeExportQualityProfileId(profileId) {
  return normalizeExportQualityProfileId(profileId)
}

export function getFallbackVideoEncodingSettings(profileId) {
  const profile = getExportQualityProfileById(profileId)

  return {
    crf: profile.fallbackMuxCrf,
    preset: profile.fallbackMuxPreset,
  }
}

export function buildNativeEncoderOutputArgs(codec, profileId) {
  const profile = getExportQualityProfileById(profileId)

  if (codec === 'h264_nvenc') {
    return ['-cq', String(profile.nativeNvencCq), '-preset', profile.nativeNvencPreset]
  }

  if (codec === 'h264_qsv') {
    return ['-global_quality', String(profile.nativeQsvGlobalQuality), '-preset', profile.nativeQsvPreset]
  }

  if (codec === 'h264_amf') {
    return ['-quality', profile.nativeAmfQuality, '-usage', 'transcoding']
  }

  return ['-preset', profile.nativeCpuPreset, '-crf', String(profile.nativeCpuCrf)]
}