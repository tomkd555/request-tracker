import type { Issue } from "../../shared/types";

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

/** Open issues of `me` (assigned or reported) that carry an unseen update. */
export const unseenMine = (issues: Issue[], me: string): number =>
  issues.filter((i) => i.status !== "closed" && (i.assignee === me || i.reporter === me) && isUnseen(i, me)).length;
