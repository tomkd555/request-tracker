import { promises as fsp } from "node:fs";
import { ISSUE_KEY, isComment, type Comment } from "../../shared/types";
import { collection, errorCode, mapLimit, type Collection } from "./collection";
import { fileStamp } from "./fileStamp";
import type { Layout } from "./paths";

/** One directory per issue key; one append-only file per comment, so two users never overwrite each other. */
export const commentsCollection = (layout: Layout, issueKey: string): Collection<Comment> =>
  collection<Comment>({ dir: layout.comments(issueKey), guard: isComment, idOf: (comment) => comment.id });

const commentId = (createdAt: string, author: string): string => `${fileStamp(createdAt)}-${author}`;

export async function addComment(layout: Layout, comment: Comment): Promise<void> {
  const body = comment.body.trim();
  if (body === "") throw new Error("comment is empty");
  const id = commentId(comment.createdAt, comment.author);
  await commentsCollection(layout, comment.issueKey).create(id, { ...comment, id, body });
}

/** Every comment of every issue, for the search screen. Only a directory whose name passes `ISSUE_KEY` is read: `commentsCollection` throws on any other name, and a file would fail the readdir. */
export async function listAllComments(layout: Layout): Promise<Comment[]> {
  let entries: { name: string; isDirectory(): boolean }[];
  try {
    entries = await fsp.readdir(layout.commentsRoot, { withFileTypes: true });
  } catch (e) {
    if (errorCode(e) === "ENOENT") return [];
    throw e;
  }
  const issueKeys = entries.filter((entry) => entry.isDirectory() && ISSUE_KEY.test(entry.name)).map((entry) => entry.name).sort();
  const commentsPerIssue = await mapLimit(issueKeys, (issueKey) => commentsCollection(layout, issueKey).list()); // each list is itself bounded, so at most limit² files are open
  return commentsPerIssue.flat();
}
