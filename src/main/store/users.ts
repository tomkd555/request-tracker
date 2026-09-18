import { userInfo } from "node:os";
import { isIssue, isUser, type User } from "../../shared/types";
import { collection, readDir, type Collection } from "./collection";
import { fileStamp } from "./fileStamp";
import type { Layout } from "./paths";

export const currentUsername = (): string => userInfo().username;

export const usersCollection = (l: Layout): Collection<User> => collection<User>({ dir: l.users, guard: isUser, trashDir: l.trashUsers });

/** The user whose file is the OS login, or the member who bound that login on first launch. */
export async function findUser(l: Layout, login: string): Promise<User | null> {
  const c = usersCollection(l);
  return (await c.get(login)) ?? (await c.list()).find((u) => u.login === login) ?? null;
}

/** First call creates the user; a later call renames and keeps createdAt and login. */
export async function putDisplayName(l: Layout, username: string, displayName: string): Promise<User> {
  const name = displayName.trim();
  if (name === "") throw new Error("display name is empty");
  const existing = await usersCollection(l).get(username);
  const user: User = { ...existing, username, displayName: name, createdAt: existing?.createdAt ?? new Date().toISOString() };
  await usersCollection(l).put(username, user);
  return user;
}

/** A member added by name in project settings or from the 担当者 chooser; the id is the creation stamp, as for wiki pages. A name already registered returns that member, since 自分の担当 and the reporter checks match on the id. */
export async function addUser(l: Layout, displayName: string): Promise<User> {
  const name = displayName.trim();
  if (name === "") throw new Error("display name is empty");
  const c = usersCollection(l);
  const existing = (await c.list()).find((u) => u.displayName === name);
  if (existing) return existing;
  let at = Date.now();
  for (let attempt = 0; attempt < 50; attempt++) {
    const createdAt = new Date(at).toISOString();
    const user: User = { username: fileStamp(createdAt), displayName: name, createdAt };
    try {
      await c.create(user.username, user);
      return user;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      at += 1;
    }
  }
  throw new Error("could not allocate a member id");
}

export const ALREADY_CLAIMED = "already-claimed";

/** Binds the OS login to a member added by name; refused once any login is bound. */
export async function claimUser(l: Layout, username: string, login: string): Promise<User> {
  const u = await usersCollection(l).get(username);
  if (u === null) throw new Error(`no such member: ${username}`);
  if (u.login !== undefined) throw new Error(ALREADY_CLAIMED);
  const claimed: User = { ...u, login };
  await usersCollection(l).put(username, claimed);
  return claimed;
}

export const USER_IN_USE = "in-use";

/** Moves the member to trash/users/; refused while an issue names the member as assignee or reporter. */
export async function removeUser(l: Layout, username: string): Promise<void> {
  if ((await readDir(l.issues, isIssue)).some((i) => i.assignee === username || i.reporter === username)) throw new Error(USER_IN_USE); // uncached: the guard must see the share as it is
  await usersCollection(l).remove(username);
}
