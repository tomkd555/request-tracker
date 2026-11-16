import { userInfo } from "node:os";
import { isUser, type User } from "../../shared/types";
import { collection, createWithStampId, type Collection } from "./collection";
import { readIssuesUncached } from "./issues";
import type { Layout } from "./paths";

export const currentUsername = (): string => userInfo().username;

export const usersCollection = (layout: Layout): Collection<User> =>
  collection<User>({ dir: layout.users, guard: isUser, trashDir: layout.trashUsers, idOf: (user) => user.username });

/** The user whose file is the OS login, or the member who bound that login on first launch. */
export async function findUser(layout: Layout, login: string): Promise<User | null> {
  const users = usersCollection(layout);
  return (await users.get(login)) ?? (await users.list()).find((user) => user.login === login) ?? null;
}

function trimmedDisplayName(displayName: string): string {
  const name = displayName.trim();
  if (name === "") throw new Error("display name is empty");
  return name;
}

/** First call creates the user; a later call renames and keeps createdAt and login. */
export async function putDisplayName(layout: Layout, username: string, displayName: string): Promise<User> {
  const name = trimmedDisplayName(displayName);
  const users = usersCollection(layout);
  const existing = await users.get(username);
  const user: User = { ...existing, username, displayName: name, createdAt: existing?.createdAt ?? new Date().toISOString() };
  await users.put(username, user);
  return user;
}

/** A member added by name in project settings or from the 担当者 chooser; the id is the creation stamp, as for wiki pages. A name already registered returns that member, since 自分の担当 and the reporter checks match on the id. */
export async function addUser(layout: Layout, displayName: string): Promise<User> {
  const name = trimmedDisplayName(displayName);
  const users = usersCollection(layout);
  const existing = (await users.list()).find((user) => user.displayName === name);
  if (existing) return existing;
  return createWithStampId(users, Date.now(), (username, createdAt) => ({ username, displayName: name, createdAt }), "member");
}

const ALREADY_CLAIMED = "already-claimed";

/** Binds the OS login to a member added by name; refused once any login is bound. */
export async function claimUser(layout: Layout, username: string, login: string): Promise<User> {
  const users = usersCollection(layout);
  const member = await users.get(username);
  if (member === null) throw new Error(`no such member: ${username}`);
  if (member.login !== undefined) throw new Error(ALREADY_CLAIMED);
  const claimed: User = { ...member, login };
  await users.put(username, claimed);
  return claimed;
}

const USER_IN_USE = "in-use";

/** Moves the member to trash/users/; refused while an issue names the member as assignee or reporter. */
export async function removeUser(layout: Layout, username: string): Promise<void> {
  const isNamedByAnIssue = (await readIssuesUncached(layout)).some((issue) => issue.assignee === username || issue.reporter === username);
  if (isNamedByAnIssue) throw new Error(USER_IN_USE);
  await usersCollection(layout).remove(username);
}
