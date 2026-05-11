# TASK

## Active
## Backlog
## Completed
- [x] Fix native export subtitle and voiceover parity - Native export now sends explicit frame dimensions through IPC, resolves/logs the main-process frame size, and overwrites final mux output deterministically; validation passed with `npm run lint`, `npm run build`, and `npm run desktop:start` with Flask health 200 plus renderer load confirmed.
