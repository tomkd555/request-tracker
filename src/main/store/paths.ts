import { join } from "node:path";

const KEY = /^\d{2}-\d{4,}$/;
const STAMP = /^\d{8}T\d{9}Z$/;

/** Issue keys reach path joins from the renderer and from other people's files; only "26-0012"-shaped keys pass. */
export function assertKey(key: string): string {
  if (!KEY.test(key)) throw new Error(`invalid issue key: ${key}`);
  return key;
}

/** Wiki page ids reach path joins the same way; only creation stamps pass. */
export function assertStamp(id: string): string {
  if (!STAMP.test(id)) throw new Error(`invalid wiki page id: ${id}`);
  return id;
}

// Shared-folder layout; documented in README.md, "How it works".
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
    wikiAttachments: (id: string) => join(root, "wiki-attachments", assertStamp(id)),
    wikiAttachmentsRoot: join(root, "wiki-attachments"),
    historyIssues: join(root, "history", "issues"),
    historyWiki: join(root, "history", "wiki"),
    historyProject: join(root, "history", "project"),
    trashIssues: join(root, "trash", "issues"),
    trashWiki: join(root, "trash", "wiki"),
    trashAttachments: (key: string) => join(root, "trash", "attachments", assertKey(key)),
    trashWikiAttachments: (id: string) => join(root, "trash", "wiki-attachments", assertStamp(id)),
  };
}

export type Layout = ReturnType<typeof layout>;

export function collectionDirs(l: Layout): string[] {
  return [l.users, l.issues, l.commentsRoot, l.attachmentsRoot, l.wiki, l.wikiAttachmentsRoot, l.historyIssues, l.historyWiki, l.trashIssues, l.trashWiki];
}
