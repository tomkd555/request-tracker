# Implementation Plan: Request Tracker

## Overview

Build the Electron request tracker described in `SPEC.md` and the four module specs, in the order the capability map fixes: store → issues, wiki → gantt. Tasks 1–3 are foundation tasks verified by tests; from Task 4 on, every task leaves a usable screen, ending in a portable exe (Task 18). Tasks are recorded in `tasks/todo.md`.

## Dependency Graph

```
T1 scaffold + tokens
 └─ T2 store: collection primitives + record types
     └─ T3 store: config, project, users, IPC, preload
         └─ T4 renderer: first launch + shell
             ├─ T5 create issue + key allocation ─┬─ T6 list + filters + children
             │                                    ├─ T7 edit in place + history
             │                                    ├─ T9 comments
             │                                    ├─ T10 attachments: files ── T11 attachments: folders
             │                                    ├─ T12 delete issue
             │                                    ├─ T13 monthly counts + CSV
             │                                    └─ T16 gantt
             ├─ T8 poller + live refresh (after T5 and T7: needs an editable issue to watch)
             └─ T14 wiki pages ── T15 wiki history + delete
T17 styling pass (after T4–T16)
T18 packaging (after everything)
```

## Architecture Decisions

- **One generic collection module.** `src/main/store/collection.ts` implements list/get/create/put/remove/history for a directory of JSON files, parameterised by a directory resolver (a constant for issues, wiki and users; `comments/<KEY>` for comments), a type guard, and whether history and trash are kept (each optional). `issues`, `wiki`, `users`, `comments` are thin instances. This is where atomic write, `wx` create and trash-move live once. Nothing under `src/main/store/` imports `electron`; `ipc.ts` and `index.ts` pass in paths and dialog results, so vitest needs no electron mock.
- **Key allocation in the main process.** `issues.create` takes a draft without a key, reads `issues/` and `trash/issues/`, and allocates; the renderer never sees trashed keys and can never reuse one.
- **Record types and guards in `src/shared/types.ts`.** Written in Task 2 for every module so later tasks never edit the schema file. Guards are hand-written predicates; no validation library.
- **Hash routing in-house.** A `useHashRoute()` hook (parse `location.hash`, subscribe to `hashchange`) replaces a router dependency. Routes are the paths named in the module specs.
- **One renderer data hook per collection.** `useIssues()`, `useWiki()` keep an in-memory map, load through `window.api`, and patch one record on each `store:changed` event. No state library.
- **Poller in main, events over IPC.** `webContents.send("store:changed", …)` from the 5 s poller; the preload wraps it in `onChanged`.
- **Attachment copy through a temp name in the target directory.** Both file (`fs.copyFile`) and folder (`fs.cp` recursive with a filter for size and extension) land under `.<name>.tmp-<pid>` and are renamed. The rename after a `wx` probe is the collision claim.
- **Palette sampled once, in Task 1.** `tokens.css` holds Backlog's colours as CSS variables, sampled from the product UI; every later task uses variables only. Task 17 is the screen-by-screen styling pass.
- **electron-vite defaults kept.** `contextIsolation: true`, `nodeIntegration: false`, and the template's `sandbox` setting as scaffolded. The renderer entry moves from the template's `src/renderer/src/` to the `SPEC.md` layout in Task 1, and `src/shared` is added to both tsconfig include lists.

## Task List

### Phase 1: Foundation
- [ ] Task 1: Scaffold, tokens, test and package commands
- [ ] Task 2: Store collection primitives and record types
- [ ] Task 3: Store config, project, users, IPC and preload
- [ ] Task 4: First-launch screens and app shell

### Checkpoint A: Foundation
- [ ] `npm run typecheck` and `npx vitest run` pass
- [ ] Fresh launch → folder picker → fiscal month → display name → empty issue list; second launch opens the list directly
- [ ] Review with human

### Phase 2: Issues
- [ ] Task 5: Create an issue with fiscal-year key
- [ ] Task 6: Issue list with filters and parent/child rows
- [ ] Task 7: Edit in place, history and restore
- [ ] Task 8: Poller and live refresh

### Checkpoint B: Two clients
- [ ] Two instances on one folder: create, edit and status change propagate within 10 s
- [ ] Key allocation from both instances at once yields distinct keys
- [ ] Review with human

- [ ] Task 9: Comments
- [ ] Task 10: Attachments: files
- [ ] Task 11: Attachments: folders
- [ ] Task 12: Delete issue
- [ ] Task 13: Monthly counts and CSV export

### Checkpoint C: Issues complete
- [ ] Every success criterion in `SPEC-issues.md` checked by hand
- [ ] Review with human

### Phase 3: Wiki and Gantt
- [ ] Task 14: Wiki pages
- [ ] Task 15: Wiki history, restore and delete
- [ ] Task 16: Gantt
- [ ] Task 17: Styling pass against Backlog

### Checkpoint D: Modules complete
- [ ] Success criteria in `SPEC-wiki.md` and `SPEC-gantt.md` checked by hand
- [ ] Review with human

### Phase 4: Release
- [ ] Task 18: Portable exe

### Checkpoint E: Release
- [ ] Exe runs on a machine without Node or the repo
- [ ] All `SPEC.md` success criteria met

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `fs.rename` over an existing file on an SMB share fails or is non-atomic on some servers | High | Task 2 tests run on a local temp dir; Checkpoint B repeats the create/edit test on the real share before Phase 2 continues. Fallback, behind the same function: write the temp file, rename the existing target into `history/`, then rename the temp into place; the target is never truncated and nothing is unlinked. |
| `wx` exclusive create honoured differently over SMB | Med | Same Checkpoint B test with two instances; if a duplicate key ever appears, add a per-key retry loop that re-reads the directory. |
| Poller cost grows with the number of files (`stat` per file every 5 s over the network) | Low below roughly a thousand files across the polled directories (estimate, unmeasured) | `// ponytail` marker in the poller; per-directory mtime shortcut is the upgrade. |
| electron-builder on Windows fails to extract `winCodeSign` without symlink rights | Med | Task 18 documents enabling Developer Mode or running the package step once as administrator; `portable` target needs no signing. |
| `webUtils.getPathForFile` is available from Electron 29; `File.path` is gone from Electron 32 | Med | Task 1 records the installed Electron version in `SPEC.md`; Task 10 verifies drag-and-drop before building on it. |
| Backlog palette values unknown until sampled | Low | Task 1 samples the listed tokens from the Backlog product UI (issue list and detail screens) and records the screen per colour; the variables are the only place they live. |

## Open Questions

- Which Electron version the electron-vite template installs today; recorded in `SPEC.md` at Task 1.
- Whether the real share honours atomic rename; settled at Checkpoint B.
- A Japanese handover note for colleagues (where the exe is, first-launch steps, the unreachable-share message) is outside the specs. Left undone; add it as a task if wanted.
