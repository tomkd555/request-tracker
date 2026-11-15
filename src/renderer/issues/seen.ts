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

const write = (issueKey: string, stamp: string): void => {
  try {
    window.localStorage.setItem(KEY(issueKey), stamp);
  } catch {
    // storage unavailable: the dot simply stays
  }
};

export const markSeen = (issue: Issue): void => write(issue.key, issue.updatedAt);

/** Stored in place of a stamp when my own save went over a version of someone else that this machine never opened. */
export const PENDING = "unseen";

/** True when someone else saved the issue after this machine last opened it, also once my own save from the board, the Gantt or bulk edit went on top of that save. */
export const unseenFrom = (issue: Issue, me: string, stamp: string | null): boolean => stamp === PENDING || (issue.updatedBy !== me && stamp !== issue.updatedAt);

/** The stamp to store after `me` saved `next` over `prev`: the new version when `prev` was seen, else PENDING, which keeps the dot on. */
export const stampAfterOwnSave = (prev: Issue, next: Issue, me: string, stamp: string | null): string => (unseenFrom(prev, me, stamp) ? PENDING : next.updatedAt);

/** Call after a save made outside the detail screen (board, Gantt, bulk edit), so a change of someone else that was never opened stays marked. */
export const carrySeen = (prev: Issue, next: Issue, me: string): void => write(next.key, stampAfterOwnSave(prev, next, me, read(next.key)));

/** The stamp this machine stored for `issueKey`, or null. */
export const seenStamp = (issueKey: string): string | null => read(issueKey);

export const isUnseen = (issue: Issue, me: string): boolean => unseenFrom(issue, me, read(issue.key));
