export function getKeptScenes(scenes, deletedSceneIds) {
  if (!scenes) return [];
  return scenes.filter(s => !deletedSceneIds.has(s.id));
}

export function getKeptDuration(keptScenes) {
  return keptScenes.reduce((sum, s) => sum + s.duration, 0);
}

export function mapRealToKeptTime(realTime, keptScenes) {
  let keptTime = 0;
  for (const scene of keptScenes) {
    if (realTime >= scene.start && realTime <= scene.end) {
      return keptTime + (realTime - scene.start);
    } else if (realTime > scene.end) {
      keptTime += scene.duration;
    } else if (realTime < scene.start) {
      return keptTime;
    }
  }
  return keptTime;
}

export function mapKeptToRealTime(keptTime, keptScenes) {
  let acc = 0;
  for (const scene of keptScenes) {
    if (acc + scene.duration >= keptTime) {
      return scene.start + (keptTime - acc);
    }
    acc += scene.duration;
  }
  return keptScenes.length > 0 ? keptScenes[keptScenes.length - 1].end : 0;
}
