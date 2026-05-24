function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load scene grid image.'));
    image.src = src;
  });
}

function normalizeGridOptions(options = {}) {
  const columns = Number.isFinite(options.columns) && options.columns > 0 ? options.columns : 10;
  const cellWidth = Number.isFinite(options.cellWidth) && options.cellWidth > 0 ? options.cellWidth : 192;
  const cellHeight = Number.isFinite(options.cellHeight) && options.cellHeight > 0 ? options.cellHeight : 108;

  return { cellHeight, cellWidth, columns };
}

function dataUrlToBytes(dataUrl) {
  const payload = String(dataUrl || '');
  const base64Marker = ';base64,';
  const markerIndex = payload.indexOf(base64Marker);
  if (markerIndex < 0) {
    throw new Error('Unsupported scene grid data URL format.');
  }

  const base64 = payload.slice(markerIndex + base64Marker.length);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export async function buildSceneGridImage(thumbnailUrls, options = {}) {
  const cleanedUrls = Array.isArray(thumbnailUrls)
    ? thumbnailUrls.filter((url) => typeof url === 'string' && url)
    : [];

  if (!cleanedUrls.length) {
    return null;
  }

  const { cellHeight, cellWidth, columns } = normalizeGridOptions(options);
  const rows = Math.max(1, Math.ceil(cleanedUrls.length / columns));

  const canvas = document.createElement('canvas');
  canvas.width = columns * cellWidth;
  canvas.height = rows * cellHeight;

  const context = canvas.getContext('2d');
  context.fillStyle = '#000000';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const loadedImages = await Promise.all(cleanedUrls.map((url) => loadImage(url)));

  for (let index = 0; index < loadedImages.length; index += 1) {
    const image = loadedImages[index];
    const column = index % columns;
    const row = Math.floor(index / columns);
    context.drawImage(image, column * cellWidth, row * cellHeight, cellWidth, cellHeight);
  }

  const dataUrl = canvas.toDataURL('image/png');

  return {
    bytes: dataUrlToBytes(dataUrl),
    cellHeight,
    cellWidth,
    columns,
    count: cleanedUrls.length,
    dataUrl,
  };
}

export async function extractSceneGridThumbnails(gridUrl, scenes, options = {}) {
  if (!gridUrl || !Array.isArray(scenes) || scenes.length === 0) {
    return {};
  }

  const { cellHeight, cellWidth, columns } = normalizeGridOptions(options);
  const image = await loadImage(gridUrl);
  const canvas = document.createElement('canvas');
  canvas.width = cellWidth;
  canvas.height = cellHeight;
  const context = canvas.getContext('2d');

  const nextThumbnails = {};

  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const thumbnailIndex = Number.isFinite(scene?.thumbnailIndex) ? scene.thumbnailIndex : index;
    const sourceX = (thumbnailIndex % columns) * cellWidth;
    const sourceY = Math.floor(thumbnailIndex / columns) * cellHeight;

    context.clearRect(0, 0, cellWidth, cellHeight);
    context.drawImage(image, sourceX, sourceY, cellWidth, cellHeight, 0, 0, cellWidth, cellHeight);
    const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.85);

    nextThumbnails[thumbnailIndex] = thumbnailUrl;
    nextThumbnails[scene.id] = thumbnailUrl;
  }

  return nextThumbnails;
}
