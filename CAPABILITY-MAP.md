# Capability Map: Request Tracker

| Module id | Responsibility | Depends on |
|---|---|---|
| store | Read/write JSON records on the shared folder, detect changes made by other clients, identify the current user, hold local config | — |
| issues | Parent and child issues, status/assignee/dates/priority, comments, attachments, list and filters, monthly counts | store |
| wiki | Pages of Markdown for procedures and notes | store |
| gantt | Bars of issue start and due dates on a day grid | issues |

Build order: store → issues, wiki → gantt

## Boundaries

- All file-system access lives in `store` (main process). `issues` and `wiki` never touch `fs`; they call the store API over IPC.
- `gantt` reads issue records through the `issues` module's loaded state; it writes nothing.
- The contract between `store` and its consumers is the IPC surface in `SPEC-store.md`.
- Specs: `SPEC.md` (shared sections), `SPEC-store.md`, `SPEC-issues.md`, `SPEC-wiki.md`, `SPEC-gantt.md`.
