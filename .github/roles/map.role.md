# MAP.md Role

Use this role whenever you create, rebuild, or update the repository map file at the workspace root.

## Purpose
- `MAP.md` is the query map for the repository.
- It helps agents and humans find the correct file to change before editing.
- Every file description in `MAP.md` must be written in English.

## When To Create Or Rebuild MAP.md
- Create `MAP.md` immediately if it does not exist and the task creates files, adds functionality, changes file responsibilities, or needs better location accuracy.
- Rebuild the affected sections when files are split, merged, renamed, or moved.
- Update it in the same session as the code change. Do not defer the map update.

## Coverage Rules
- Cover the whole active workspace, not just the file touched by the current task, when `MAP.md` is created for the first time.
- After `MAP.md` exists, update only the affected entries unless the structure has drifted enough that a broader cleanup is faster and safer.
- Include source files, key configs, important scripts, and entry points.
- Skip generated artifacts, caches, uploads, and dependency folders unless the repository intentionally edits them.

## Entry Format
- Keep one entry per file.
- Use workspace-relative paths.
- Use concise English.
- Explain the file's main responsibility and, when useful, what kind of changes should be made there.

Recommended format:

```md
# Repository Map

## frontend
- `frontend/src/hooks/useVideoEditor.js` - Coordinates editor state, detection, subtitles, export flow, and session restore logic.
- `frontend/src/utils/timeMapping.js` - Maps timestamps between original video time and kept-scene timeline after deletions.

## server
- `server/app.py` - Flask entry point, persistence APIs, upload endpoints, and external transcription or translation proxies.
```

## Writing Rules
- Group entries by top-level area such as `frontend`, `server`, `notebooks`, or `.github`.
- Keep descriptions short, specific, and action-oriented.
- Describe current responsibility, not implementation trivia.
- Mention split boundaries after refactors when that helps future routing.
- If a file has become a thin wrapper, say where the real behavior lives.

## Update Rules
- When creating a new file, add its `MAP.md` entry in the same session.
- When a file gains a new responsibility, rewrite the entry to reflect the new owner behavior.
- When a file is split because of the 400-line rule, update the original entry and add entries for the new files so future edits route correctly.
- When a file is removed or renamed, remove or rename its entry immediately.

## Agent Notes
- Read `MAP.md` before broad search on repair or update tasks.
- Use `MAP.md` to choose the most likely owner file, then confirm locally in code.
- If the map is missing or stale enough to misroute the task, fix `MAP.md` as part of the same session.
- Do not treat `MAP.md` as a substitute for verification. It is the routing index, not proof of behavior.