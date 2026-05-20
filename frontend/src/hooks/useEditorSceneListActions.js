import { useCallback } from 'react';

export function useEditorSceneListActions({
  clearExportResult,
  getCurrentSnapshot,
  pushState,
  scenes,
  setCurrentTime,
  setDeletedSceneIds,
  videoRef,
}) {
  const toggleDeleteScene = useCallback((sceneId) => {
    pushState(getCurrentSnapshot());
    clearExportResult();
    setDeletedSceneIds((previousIds) => {
      const nextIds = new Set(previousIds);
      if (nextIds.has(sceneId)) nextIds.delete(sceneId);
      else nextIds.add(sceneId);
      return nextIds;
    });
  }, [clearExportResult, getCurrentSnapshot, pushState, setDeletedSceneIds]);

  const restoreAllScenes = useCallback(() => {
    pushState(getCurrentSnapshot());
    clearExportResult();
    setDeletedSceneIds(new Set());
  }, [clearExportResult, getCurrentSnapshot, pushState, setDeletedSceneIds]);

  const deleteAllScenes = useCallback(() => {
    pushState(getCurrentSnapshot());
    clearExportResult();
    setDeletedSceneIds(new Set(scenes.map((scene) => scene.id)));
  }, [clearExportResult, getCurrentSnapshot, pushState, scenes, setDeletedSceneIds]);

  const seekToScene = useCallback((scene) => {
    if (!scene) return;
    setCurrentTime(scene.start);
    if (videoRef.current) videoRef.current.currentTime = scene.start;
  }, [setCurrentTime, videoRef]);

  return { deleteAllScenes, restoreAllScenes, seekToScene, toggleDeleteScene };
}