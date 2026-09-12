import { createContext, useContext } from "react";
import type { Project, User } from "../../shared/types";

export type Session = { me: User; users: User[]; project: Project; refreshUsers(): Promise<void> };

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (s === null) throw new Error("useSession outside SessionContext");
  return s;
}

export function displayNameOf(users: User[], username: string | null): string {
  if (username === null) return "";
  return users.find((u) => u.username === username)?.displayName ?? username;
}
