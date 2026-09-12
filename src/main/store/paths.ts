import { join } from "node:path";

const KEY = /^\d{2}-\d{4,}$/;

/** Issue keys reach path joins from the renderer and from other people's files; only "26-0012"-shaped keys pass. */
export function assertKey(key: string): string {
  if (!KEY.test(key)) throw new Error(`invalid issue key: ${key}`);
  return key;
}

// Shared-folder layout from SPEC-store.md.
export function layout(root: string) {
  return {
    root,
    projectFile: join(root, "project.json"),
    users: join(root, "users"),
    issues: join(root, "issues"),
    comments: (key: string) => join(root, "comments", assertKey(key)),
    commentsRoot: join(root, "comments"),
    attachments: (key: string) => join(root, "attachments", assertKey(key)),
    attachmentsRoot: join(root, "attachments"),
    wiki: join(root, "wiki"),
    historyIssues: join(root, "history", "issues"),
    historyWiki: join(root, "history", "wiki"),
    trashIssues: join(root, "trash", "issues"),
    trashWiki: join(root, "trash", "wiki"),
    trashAttachments: (key: string) => join(root, "trash", "attachments", assertKey(key)),
  };
}

export type Layout = ReturnType<typeof layout>;

export function collectionDirs(l: Layout): string[] {
  return [l.users, l.issues, l.commentsRoot, l.attachmentsRoot, l.wiki, l.historyIssues, l.historyWiki, l.trashIssues, l.trashWiki];
}
