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

export function isFaceDetectionAvailable() {
  return typeof window !== 'undefined' && typeof window.FaceDetector === 'function'
}

export async function detectLargestFaceFromImageUrl(imageUrl) {
  if (!imageUrl) {
    throw new Error('No scene frame is available for face detection.')
  }

  if (!isFaceDetectionAvailable()) {
    throw new Error('Face detection is not available in this desktop runtime.')
  }

  const image = await loadImage(imageUrl)
  const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 8 })
  const faces = await detector.detect(image)
  if (!Array.isArray(faces) || faces.length === 0) {
    throw new Error('No face was detected in this scene frame.')
  }

  const largestFace = faces
    .map((face) => getBoundingBox(face))
    .filter(Boolean)
    .sort((left, right) => (right.width * right.height) - (left.width * left.height))[0]

  const imageWidth = Math.max(1, image.naturalWidth || image.width || 1)
  const imageHeight = Math.max(1, image.naturalHeight || image.height || 1)

  return {
    focusX: Math.max(0, Math.min(1, (largestFace.x + (largestFace.width / 2)) / imageWidth)),
    focusY: Math.max(0, Math.min(1, (largestFace.y + (largestFace.height / 2)) / imageHeight)),
    width: Math.max(0, largestFace.width / imageWidth),
    height: Math.max(0, largestFace.height / imageHeight),
  }
}
