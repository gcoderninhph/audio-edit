function loadImage(imageUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load the scene frame for face detection.'))
    image.src = imageUrl
  })
}

function getBoundingBox(face) {
  return face?.boundingBox || face?.box || null
}

const FACE_DETECTION_ATTEMPTS = Object.freeze([
  { fastMode: true, maxDetectedFaces: 12, enhance: false },
  { fastMode: false, maxDetectedFaces: 16, enhance: false },
  { fastMode: false, maxDetectedFaces: 16, enhance: true },
])

function getSourceSize(source) {
  return {
    height: Math.max(1, source?.naturalHeight || source?.videoHeight || source?.height || 1),
    width: Math.max(1, source?.naturalWidth || source?.videoWidth || source?.width || 1),
  }
}

function createEnhancedSource(image) {
  if (typeof document === 'undefined') return null

  const { height, width } = getSourceSize(image)
  const scale = Math.min(2.25, Math.max(1, 720 / Math.max(width, height)))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const context = canvas.getContext('2d')
  if (!context) return null

  context.filter = 'contrast(1.25) brightness(1.08) saturate(1.05)'
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}

function normalizeFaceBox(boundingBox, source, sourceIndex) {
  const { height: imageHeight, width: imageWidth } = getSourceSize(source)

  return {
    focusX: Math.max(0, Math.min(1, (boundingBox.x + (boundingBox.width / 2)) / imageWidth)),
    focusY: Math.max(0, Math.min(1, (boundingBox.y + (boundingBox.height / 2)) / imageHeight)),
    height: Math.max(0, boundingBox.height / imageHeight),
    sourceIndex,
    width: Math.max(0, boundingBox.width / imageWidth),
  }
}

async function detectLargestFaceFromSource(source, attempt, sourceIndex) {
  const detector = new window.FaceDetector({
    fastMode: attempt.fastMode,
    maxDetectedFaces: attempt.maxDetectedFaces,
  })
  const faces = await detector.detect(source)
  if (!Array.isArray(faces) || faces.length === 0) {
    return null
  }

  const largestFace = faces
    .map((face) => getBoundingBox(face))
    .filter(Boolean)
    .sort((left, right) => (right.width * right.height) - (left.width * left.height))[0]

  return largestFace ? normalizeFaceBox(largestFace, source, sourceIndex) : null
}

export function isFaceDetectionAvailable() {
  return typeof window !== 'undefined' && typeof window.FaceDetector === 'function'
}

export async function detectLargestFaceFromImageUrl(imageUrl, { sourceIndex = 0 } = {}) {
  if (!imageUrl) {
    throw new Error('No scene frame is available for face detection.')
  }

  if (!isFaceDetectionAvailable()) {
    throw new Error('Face detection is not available in this desktop runtime.')
  }

  const image = await loadImage(imageUrl)
  let lastError = null

  for (const attempt of FACE_DETECTION_ATTEMPTS) {
    const source = attempt.enhance ? createEnhancedSource(image) : image
    if (!source) continue

    try {
      const face = await detectLargestFaceFromSource(source, attempt, sourceIndex)
      if (face) return face
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('No face was detected in this scene frame.')
}

export async function detectLargestFaceFromImageUrls(imageUrls = []) {
  const candidates = [...new Set(imageUrls.filter(Boolean))]
  if (candidates.length === 0) {
    throw new Error('No scene frame is available for face detection.')
  }

  const detectedFaces = []
  let lastError = null

  for (const [index, imageUrl] of candidates.entries()) {
    try {
      detectedFaces.push(await detectLargestFaceFromImageUrl(imageUrl, { sourceIndex: index }))
    } catch (error) {
      lastError = error
    }
  }

  if (detectedFaces.length > 0) {
    return detectedFaces.sort((left, right) => (right.width * right.height) - (left.width * left.height))[0]
  }

  throw lastError || new Error('No face was detected in this scene frame.')
}
