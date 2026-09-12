# Security

Request Tracker runs entirely on the user's machine and a shared folder. It has no server, no accounts and no credentials. The renderer is sandboxed and reaches the file system only through the typed IPC surface in `src/main/ipc.ts`.

To report a vulnerability, open a GitHub issue with the steps to reproduce. Fixes ship as a new portable exe on the Releases page.
