# TASK.md Role

Use this role whenever you create, rebuild, or update the task tracker at the workspace root.

## Purpose
- `TASK.md` is the persistent task tracker for the repository.
- It records current work, planned follow-ups, refactors, validation status, and completion notes.
- It must stay actionable enough that another agent can resume work without re-discovering context.

## When To Create Or Update TASK.md
- Create `TASK.md` immediately if a task changes code and no persistent tracker exists.
- Update it whenever scope, validation status, blockers, or follow-up work changes.
- Add a new task immediately when a touched file is over 400 lines or likely to exceed 400 lines and needs splitting.
- Do not postpone task tracking to a later session.

## Required Sections
Recommended structure:

```md
# TASK

## Active
- [ ] Short task title
  - Scope: frontend | server | both
  - Owner files: `path/to/file`
  - Plan: short implementation plan
  - Validation: pending

## Backlog
- [ ] Follow-up item

## Completed
- [x] Finished item - include short outcome and validation summary
```

## Writing Rules
- Keep titles short and action-oriented.
- Track status with checkboxes.
- Record owner files so future agents know where the change belongs.
- Record the current plan briefly before implementation when the task is non-trivial.
- Record validation outcomes when the task is complete or blocked.
- Keep content concise, but include enough detail for handoff.

## 400-Line Guardrail Rules
- If any touched file is already over 400 lines, add or update a task for splitting it in the current session.
- If a planned change is likely to push a file beyond 400 lines, add the split task before implementing.
- The task entry must say why the file is too large, the intended split boundaries, and whether the split was completed in the session.
- Do not quietly leave oversized files without a tracked follow-up.

## Update Rules
- Move completed items to `Completed` with a one-line outcome and validation note.
- Keep unfinished follow-ups in `Active` or `Backlog`.
- Remove stale plans when the real implementation path changes.
- If the user provides another task file path, use that file instead but preserve the same structure and rules.

## Agent Notes
- Read `TASK.md` before editing code when it exists.
- Treat `TASK.md` as the source of truth for current scope and open follow-ups.
- When a task uncovers new work, add it before concluding.
- When validation fails because of a pre-existing problem outside the current scope, record that in the relevant task item instead of claiming full success.