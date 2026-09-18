import type { Issue, StatusDef } from "../../shared/types";
import { isDoneStatus } from "./labels";

// ponytail: seen state lives per machine in localStorage; a users/<name>/seen.json on the share would follow if people switch machines
const KEY = (issueKey: string): string => `seen:${issueKey}`;

const read = (issueKey: string): string | null => {
  try {
    return window.localStorage.getItem(KEY(issueKey));
  } catch {
    return null;
  }
};

export function markSeen(issue: Issue): void {
  try {
    window.localStorage.setItem(KEY(issue.key), issue.updatedAt);
  } catch {
    // storage unavailable: the dot simply stays
  }
}

/** True when someone else saved the issue after this machine last opened it. */
export const isUnseen = (issue: Issue, me: string): boolean => issue.updatedBy !== me && read(issue.key) !== issue.updatedAt;

/** Issues of `me` (assigned or reported) short of 完了 that carry an unseen update. */
export const unseenMine = (issues: Issue[], me: string, statuses: StatusDef[]): number =>
  issues.filter((i) => !isDoneStatus(statuses, i.status) && (i.assignee === me || i.reporter === me) && isUnseen(i, me)).length;
