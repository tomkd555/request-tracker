import { userInfo } from "node:os";
import { isUser, type User } from "../../shared/types";
import { collection, type Collection } from "./collection";
import type { Layout } from "./paths";

export const currentUsername = (): string => userInfo().username;

export const usersCollection = (l: Layout): Collection<User> => collection<User>({ dir: l.users, guard: isUser });

/** First call creates the user; a later call renames and keeps createdAt. */
export async function registerUser(l: Layout, username: string, displayName: string): Promise<User> {
  const name = displayName.trim();
  if (name === "") throw new Error("display name is empty");
  const existing = await usersCollection(l).get(username);
  const user: User = { username, displayName: name, createdAt: existing?.createdAt ?? new Date().toISOString() };
  await usersCollection(l).put(username, user);
  return user;
}
