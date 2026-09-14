import type { Project, User } from "../../shared/types";

export type BootStep = "folder" | "month" | "name" | "ready";

/** Which first-launch screen comes next, given what the store already has. */
export function nextStep(config: { rootDir: string } | null, project: Project | null, me: User | null): BootStep {
  if (config === null) return "folder";
  if (project === null) return "month";
  if (me === null) return "name";
  return "ready";
}
