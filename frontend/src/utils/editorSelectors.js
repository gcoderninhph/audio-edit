export function getCurrentSceneAtTime(scenes, currentTime) {
  return scenes.find((scene) => currentTime >= scene.start && currentTime < scene.end) || null;
}

export function filterVisibleSubtitles(subtitles, scenes, deletedSceneIds) {
  if (!subtitles || subtitles.length === 0) return [];

  const isDeletedAtTime = (time) => {
    const scene = scenes.find((item) => time >= item.start && time <= item.end);
    return scene ? deletedSceneIds.has(scene.id) : false;
  };

  return subtitles.filter((subtitle) => {
    const startDeleted = isDeletedAtTime(subtitle.start);
    const endDeleted = isDeletedAtTime(subtitle.end);
    return !(startDeleted && endDeleted);
  });
}