import { promises as fsp } from "node:fs";
import { ISSUE_KEY, isComment, type Comment } from "../../shared/types";
import { collection, type Collection } from "./collection";
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

/** Every comment of every issue, for the search screen. A stray file or directory under comments/ is skipped unless its name passes `ISSUE_KEY`, since `commentsCollection` would throw on it. */
export async function listAllComments(l: Layout): Promise<Comment[]> {
  let names: string[];
  try {
    names = await fsp.readdir(l.commentsRoot);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const keys = names.filter((n) => ISSUE_KEY.test(n)).sort();
  const lists = await Promise.all(keys.map((key) => commentsCollection(l, key).list()));
  return lists.flat();
}
