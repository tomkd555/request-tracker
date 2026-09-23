# Security

Request Tracker runs entirely on the user's machine and a shared folder. It has no server, no accounts and no credentials. The renderer is sandboxed and reaches the file system only through the typed IPC surface in `src/main/ipc.ts`.

To report a vulnerability, use "Report a vulnerability" under the repository's Security tab, which opens a private advisory with the maintainer. Fixes ship as a new portable exe on the Releases page, and the advisory is published with them.
