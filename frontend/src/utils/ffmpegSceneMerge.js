const CUTTING_START_PERCENT = 10;
const CUTTING_END_PERCENT = 62;
const MERGING_START_PERCENT = 62;
const MERGING_END_PERCENT = 70;
const CONCAT_MANIFEST_PATH = 'scene-segments.txt';

function getSceneSegmentFileName(index) {
  return `scene-segment-${String(index + 1).padStart(3, '0')}.mp4`;
}

function buildSceneCutArgs(inputPath, scene, outputPath) {
  return [
    '-ss', String(scene.start),
    '-i', inputPath,
    '-t', String(scene.duration),
    '-c:v', 'libx264',
    '-threads', '1',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-avoid_negative_ts', '1',
    outputPath,
  ];
}

function buildConcatManifest(segmentFiles) {
  return `${segmentFiles.map((fileName) => `file '${fileName}'`).join('\n')}\n`;
}

function buildConcatArgs(outputPath) {
  return [
    '-f', 'concat',
    '-safe', '0',
    '-i', CONCAT_MANIFEST_PATH,
    '-c', 'copy',
    outputPath,
  ];
}

function getSceneProgressWindow(index, totalScenes) {
  const span = CUTTING_END_PERCENT - CUTTING_START_PERCENT;
  return {
    startPercent: CUTTING_START_PERCENT + ((span * index) / totalScenes),
    endPercent: CUTTING_START_PERCENT + ((span * (index + 1)) / totalScenes),
  };
}

export async function buildMergedSceneTrack({
  ffmpeg,
  inputPath,
  keptScenes,
  runStage,
  onProgress,
  emitLog,
  transientFiles,
}) {
  const segmentFiles = [];

  keptScenes.forEach((_scene, index) => {
    const segmentFileName = getSceneSegmentFileName(index);
    segmentFiles.push(segmentFileName);
    transientFiles.push(segmentFileName);
  });
  transientFiles.push(CONCAT_MANIFEST_PATH);

  for (const [index, scene] of keptScenes.entries()) {
    emitLog(
      onProgress,
      'cutting',
      `Extract scene ${index + 1}/${keptScenes.length} • ${scene.duration.toFixed(2)}s`,
    );
    await runStage(
      ffmpeg,
      buildSceneCutArgs(inputPath, scene, segmentFiles[index]),
      {
        phase: 'cutting',
        ...getSceneProgressWindow(index, keptScenes.length),
      },
      onProgress,
    );
  }

  await ffmpeg.writeFile(CONCAT_MANIFEST_PATH, new TextEncoder().encode(buildConcatManifest(segmentFiles)));
  emitLog(onProgress, 'merging', `Prepared concat manifest for ${segmentFiles.length} segments`);

  await runStage(
    ffmpeg,
    buildConcatArgs('cut.mp4'),
    {
      phase: 'merging',
      startPercent: MERGING_START_PERCENT,
      endPercent: MERGING_END_PERCENT,
    },
    onProgress,
  );
}