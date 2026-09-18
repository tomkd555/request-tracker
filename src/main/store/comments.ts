import { promises as fsp } from "node:fs";
import { ISSUE_KEY, isComment, type Comment } from "../../shared/types";
import { collection, mapLimit, type Collection } from "./collection";
import { fileStamp } from "./fileStamp";
import type { Layout } from "./paths";

/** One directory per issue key; one append-only file per comment, so two users never overwrite each other. */
export const commentsCollection = (l: Layout, key: string): Collection<Comment> =>
  collection<Comment>({ dir: l.comments(key), guard: isComment });

export const commentId = (createdAt: string, author: string): string => `${fileStamp(createdAt)}-${author}`;

export async function addComment(l: Layout, c: Comment): Promise<void> {
  const body = c.body.trim();
  if (body === "") throw new Error("comment is empty");
  const id = commentId(c.createdAt, c.author);
  await commentsCollection(l, c.issueKey).create(id, { ...c, id, body });
}

/** Every comment of every issue, for the search screen. Only a directory whose name passes `ISSUE_KEY` is read: `commentsCollection` throws on any other name, and a file would fail the readdir. */
export async function listAllComments(l: Layout): Promise<Comment[]> {
  let entries: { name: string; isDirectory(): boolean }[];
  try {
    entries = await fsp.readdir(l.commentsRoot, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const keys = entries.filter((e) => e.isDirectory() && ISSUE_KEY.test(e.name)).map((e) => e.name).sort();
  const lists = await mapLimit(keys, (key) => commentsCollection(l, key).list()); // each list is itself bounded, so at most limit² files are open
  return lists.flat();
}
