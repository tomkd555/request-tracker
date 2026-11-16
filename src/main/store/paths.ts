import { promises as fsp } from "node:fs";
import { join } from "node:path";
import { ISSUE_KEY, STAMP_ID } from "../../shared/types";
import { assertId } from "./collection";

/** Issue keys reach path joins from the renderer and from other people's files; only "26-0012"-shaped keys pass. */
export function assertIssueKey(key: string): string {
  if (!ISSUE_KEY.test(key)) throw new Error(`invalid issue key: ${key}`);
  return key;
}

/** Wiki page ids reach path joins the same way; only creation stamps pass. */
function assertWikiPageId(id: string): string {
  if (!STAMP_ID.test(id)) throw new Error(`invalid wiki page id: ${id}`);
  return id;
}

// Shared-folder layout; documented in README.md, "How it works".
export function layoutOf(root: string) {
  return {
    root,
    projectFile: join(root, "project.json"),
    users: join(root, "users"),
    issues: join(root, "issues"),
    comments: (key: string) => join(root, "comments", assertIssueKey(key)),
    commentsRoot: join(root, "comments"),
    watch: (username: string) => join(root, "watch", `${assertId(username)}.json`), // the member id names a file in users/ under the same rule
    attachments: (key: string) => join(root, "attachments", assertIssueKey(key)),
    attachmentsRoot: join(root, "attachments"),
    wiki: join(root, "wiki"),
    wikiAttachments: (id: string) => join(root, "wiki-attachments", assertWikiPageId(id)),
    wikiAttachmentsRoot: join(root, "wiki-attachments"),
    reports: join(root, "reports"),
    historyIssues: join(root, "history", "issues"),
    historyWiki: join(root, "history", "wiki"),
    historyReports: join(root, "history", "reports"),
    historyProject: join(root, "history", "project"),
    trashUsers: join(root, "trash", "users"),
    trashIssues: join(root, "trash", "issues"),
    trashWiki: join(root, "trash", "wiki"),
    trashReports: join(root, "trash", "reports"),
    trashAttachments: (key: string) => join(root, "trash", "attachments", assertIssueKey(key)),
    trashWikiAttachments: (id: string) => join(root, "trash", "wiki-attachments", assertWikiPageId(id)),
  };
}

export type Layout = ReturnType<typeof layoutOf>;

export function collectionDirs(layout: Layout): string[] {
  return [
    layout.users,
    layout.issues,
    layout.commentsRoot,
    layout.attachmentsRoot,
    layout.wiki,
    layout.wikiAttachmentsRoot,
    layout.reports,
    layout.historyIssues,
    layout.historyWiki,
    layout.historyReports,
    layout.trashIssues,
    layout.trashWiki,
    layout.trashReports,
  ];
}

/** Error messages are stable tokens; the renderer turns them into Japanese. */
export const SHARE_UNREACHABLE = "share-unreachable";

/** Rejects with SHARE_UNREACHABLE when the share root is gone (drive offline, folder renamed). */
export async function assertShareReachable(root: string): Promise<void> {
  await fsp.access(root).catch(() => {
    throw new Error(SHARE_UNREACHABLE);
  });
}
