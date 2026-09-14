import { createContext, useContext } from "react";
import { STAMP_ID, type LocalConfig, type Project, type User } from "../../shared/types";

export interface Session {
  me: User;
  users: User[];
  project: Project;
  config: LocalConfig;
  /** Re-reads users/ and the current user, after a rename here or a change seen by the poller. */
  refreshUsers(): Promise<void>;
  /** Re-reads project.json (種別 list) after a save here or a change seen by the poller. */
  refreshProject(): Promise<void>;
  /** Re-reads config.json after a save on the settings screen. */
  refreshConfig(): Promise<void>;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (s === null) throw new Error("useSession outside SessionContext");
  return s;
}

/** A username with no record shows as it is when it is an OS login, and as 削除済みメンバー when it is the stamp of a removed member. */
export function displayNameOf(users: User[], username: string | null): string {
  if (username === null) return "";
  return users.find((u) => u.username === username)?.displayName ?? (STAMP_ID.test(username) ? "削除済みメンバー" : username);
}

/** The project's 種別 list plus `current` when it is set and absent from the list, so an orphaned value stays selectable. */
export function categoryOptions(project: Project, current: string): string[] {
  return withCurrent(project.categories, current);
}

/** `options` plus `current` when it is set and absent, so a value typed before the choices changed stays selectable. */
export function withCurrent(options: string[], current: string): string[] {
  return current !== "" && !options.includes(current) ? [...options, current] : options;
}
