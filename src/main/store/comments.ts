import { isComment, type Comment } from "../../shared/types";
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
