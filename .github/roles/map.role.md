# Map Files Role

Use this role whenever you create, rebuild, or update the repository map system at the workspace root.

## Purpose
- `MAP.md` is the top-level workspace map index.
- `MAP.md` should not describe every source file directly.
- `MAP.md` must list child map files grouped by project surface and domain.
- Child maps live in `map_md/` and contain file-level responsibilities.
- File responsibility descriptions inside child maps must be written in English.

## Required Structure
- Keep one primary `MAP.md` at the repository root.
- Keep child map files under `map_md/`.
- Name child map files by surface and domain.

Recommended naming pattern:
- `map_md/MAP.<surface>.<domain>.md`

Examples:
- `map_md/MAP.desktop_app.auth.md`
- `map_md/MAP.desktop_app.user_manager.md`
- `map_md/MAP.backend.auth.md`
- `map_md/MAP.backend.user_manager.md`

## When To Create Or Update `MAP.md`
- Create `MAP.md` immediately if it does not exist and the task creates files, adds functionality, changes file responsibilities, or needs better routing accuracy.
- Update `MAP.md` when a new child map is added.
- Update `MAP.md` when a child map is renamed, moved, merged, or split.
- Update it in the same session as the code change. Do not defer map updates.

## When To Create Or Update Child Maps In `map_md/`
- A new file is added within a domain.
- A file gains or changes primary responsibility.
- Files are split, merged, renamed, or moved.
- Existing map coverage has drifted and causes routing ambiguity.

## Coverage Rules
- When building the map system for the first time, cover the full active workspace using the index + child map model.
- After maps exist, update only affected child maps unless broader cleanup is faster and safer.
- Include source files, key configs, important scripts, and entry points.
- Exclude generated artifacts, caches, uploads, and dependency folders unless the repository intentionally edits them.

## `MAP.md` Entry Format (Index)
- Use workspace-relative paths.
- One line per child map file.
- Group entries by high-level surfaces such as Desktop app, Admin web, Backend, Shared.
- Keep descriptions concise and action-oriented.

Example:

```md
# Workspace Map Index

## Desktop app
- map_md/MAP.desktop_app.auth.md: Desktop authentication surface and related files.
- map_md/MAP.desktop_app.user_manager.md: Desktop user management surface.

## Backend
- map_md/MAP.backend.auth.md: Backend auth APIs, middleware, and token checks.
- map_md/MAP.backend.user_manager.md: Backend user domain services and routes.
```

## Child Map Entry Format (File-Level)
- One entry per file.
- Use workspace-relative paths.
- Describe the file's primary responsibility.
- Mention where to edit when useful.
- If a file is now a thin wrapper, point to the real owner file.

Example:

```md
# MAP.backend.auth

## server
- server/app.py - Initializes the Flask app and registers auth-related routes.
- server/auth/routes.py - Defines auth endpoints and request/response contracts.
- server/auth/service.py - Implements login logic, credential checks, and token issuance.
- server/auth/middleware.py - Enforces auth guards for protected endpoints.
```

## Writing Rules
- Keep entries short, specific, and action-oriented.
- Describe current responsibility, not implementation trivia.
- Record split boundaries after refactors when this helps future routing.
- Keep terminology consistent across maps.

## Update Rules
- New file: add it to the appropriate child map in the same session.
- Responsibility change: rewrite the file entry immediately.
- Split due to file-size/refactor: update the original entry and add entries for new files.
- Rename/remove: rename/remove entries immediately.
- New child map: add it to `MAP.md` immediately.

## Agent Routing Notes
- Always read `MAP.md` first to choose the correct child maps.
- Do not start broad search before reading the index.
- For cross-surface tasks, read all relevant child maps before editing.
- If `MAP.md` or child maps are missing/stale enough to risk misrouting, fix them in the same session.
- Maps are routing indexes, not proof of runtime behavior. Verify in code.

## Completion Checklist
- Was `MAP.md` updated when needed?
- Were the correct `map_md/*` child maps updated?
- Were newly added child maps listed in `MAP.md`?
- Are child-map file descriptions in English?
- Are all paths workspace-relative?
- Are create/rename/split/merge/delete changes fully reflected?
