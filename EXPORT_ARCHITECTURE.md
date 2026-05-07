# Export Architecture

## Goal

Export must satisfy both requirements:

1. Visual parity: the final video must match what the user sees in `panel.video-player`.
2. Throughput: export must use the machine aggressively instead of being capped near realtime.

The current renderer-record path solves parity better than the old FFmpeg-only framing path, but it is fundamentally slow because it plays video in Chromium and records a canvas stream in realtime.

## Current Bottleneck

The current export framing step is slow for structural reasons:

- `frontend/src/utils/frameCanvasExport.js` loads a hidden HTML `<video>` element.
- It calls `videoElement.play()` and waits for the media to reach `ended`.
- It records a canvas stream with `MediaRecorder`.

That means framing speed is bounded by media playback time and browser capture overhead. Even on a strong machine, this path will not fully use CPU or GPU.

## Target Architecture

Use a hybrid export pipeline:

1. Renderer remains the source of truth for the frame design.
2. Electron main process becomes the export coordinator.
3. Native FFmpeg child processes perform all heavy decode, trim, concat, compose, and encode work.
4. The renderer only prepares deterministic export assets and a manifest.

This keeps parity while moving heavy work out of the browser.

## Core Principle

Do not export by recording the preview in realtime.

Instead:

1. Define a shared render manifest from the same model used by `panel.video-player`.
2. Pre-render overlay assets from that model only when visual state changes.
3. Let native FFmpeg compose and encode offline as fast as hardware allows.

The shared render manifest is the contract between preview and export.

## Export Manifest

The renderer should send Electron main a single immutable manifest per export job.

Manifest fields:

- source video path
- kept scenes and their time ranges
- output frame preset and background
- output resolution
- subtitle events after kept-timeline mapping
- subtitle overlay assets or overlay render instructions
- audio source strategy
- export preset: `quality`, `speed`, `hardware-preferred`

Suggested new owner file:

- `frontend/electron/export/exportManifest.mjs`

## Best Rendering Strategy

To keep parity without realtime recording, export should use pre-rendered overlay assets.

### Why this is the best compromise

- Preview fidelity stays high because overlay assets come from the same render model used by the app.
- Native FFmpeg can still run faster than realtime.
- Only overlay state changes need to be rendered, not every frame.

### Asset strategy

For each subtitle event or visual-state change:

1. Render a transparent PNG from the shared canvas renderer at output resolution.
2. Save the PNG to a temp export directory.
3. In FFmpeg, overlay that PNG only during its active time range.

This removes font/layout drift and avoids asking FFmpeg/libass to approximate browser layout.

## Main-Process Export Coordinator

Electron main should own export orchestration.

Suggested new files:

- `frontend/electron/export/exportCoordinator.mjs`
- `frontend/electron/export/nativeFfmpeg.mjs`
- `frontend/electron/export/hardwareProbe.mjs`
- `frontend/electron/export/exportWorker.mjs`

Responsibilities:

- receive export manifest over IPC
- create temp working directory
- detect hardware encode capabilities
- schedule parallel chunk jobs
- collect logs and progress
- concatenate chunk outputs
- mux final audio
- clean temp files

## Native FFmpeg Requirement

The current environment does not expose `ffmpeg` in `PATH`, so the desktop app must bundle a native FFmpeg binary.

Recommended options:

1. Bundle platform-specific FFmpeg binaries with the Electron app.
2. Or add a maintained dependency that resolves a native FFmpeg binary path at runtime.

The export pipeline should not depend on FFmpeg.wasm for the fast path.

## Hardware Utilization Strategy

The current machine reports `28` logical processors.

Use that by splitting export into chunk jobs.

### CPU path

- Group kept scenes into `N` chunks.
- Default chunk concurrency:
  - `min(6, max(2, logicalCores / 4))`
- Use software encode only when no hardware encoder is available.
- Give each worker a limited thread budget instead of letting each process consume all cores.

### GPU path

Probe for available encoders:

- NVIDIA: `h264_nvenc`
- Intel: `h264_qsv`
- AMD: `h264_amf`

If available:

- reduce worker concurrency to avoid GPU encoder contention
- prefer 1 to 2 concurrent encode workers
- leave CPU free for decode, overlay prep, concat, and mux

### I/O path

- work in a temp folder under app data or a user-selected fast disk
- reuse source video by path, never materialize full bytes through renderer
- write chunk outputs sequentially but run chunk encodes in parallel

## Fast Pipeline Stages

### Stage 1: Manifest and assets

Renderer generates:

- export manifest
- overlay PNG assets for subtitle states

This should be lightweight and bounded by subtitle count, not video length.

### Stage 2: Parallel chunk encoding

For each chunk:

1. trim source scenes
2. concatenate scenes inside the chunk
3. apply frame background and video contain-fit
4. overlay subtitle PNG assets by timestamp
5. encode chunk output

Each chunk is independent and can run in parallel.

### Stage 3: Final concat and audio mux

After chunk encode:

1. concatenate chunk videos
2. mux preserved audio
3. move final artifact to export destination

Only the final concat or mux step should be serial.

## Why this Beats the Current Path

Compared with the current renderer-record export:

- no realtime playback requirement
- no browser MediaRecorder bottleneck
- no full-frame repaint for every frame in Chromium
- much higher CPU and GPU utilization
- deterministic visual parity from shared overlay assets

## Implementation Phases

### Phase 1: Add export backend interface

Add backend selection:

- `renderer-record` as fallback
- `native-fast` as target backend

### Phase 2: Bundle native FFmpeg

Add packaged binary resolution and hardware probing in Electron main.

### Phase 3: Move export orchestration to Electron main

Introduce IPC job lifecycle:

- start
- progress
- log
- cancel
- complete

### Phase 4: Add overlay asset generation

Renderer prepares subtitle overlay PNGs from the shared frame renderer.

### Phase 5: Add chunk worker pool

Process chunks in parallel based on CPU and hardware encoder profile.

### Phase 6: Switch default backend

Make `native-fast` default. Keep `renderer-record` only as compatibility fallback.

## Recommended Acceptance Criteria

The new fast architecture is only considered complete when:

1. exported frame visually matches `panel.video-player`
2. export speed is clearly faster than realtime on typical projects
3. progress and logs still appear in `panel.export`
4. cancel and cleanup are reliable
5. large videos do not require full renderer-side materialization

## Immediate Next Build Step

Implement the backend split first:

- keep the current record-frame path as fallback
- add a native export coordinator in Electron main
- move heavy encode work out of the renderer

That is the smallest architectural cut that improves speed materially without giving up parity.