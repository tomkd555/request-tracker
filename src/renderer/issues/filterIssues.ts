import type { DueFilter, Issue, IssueFilter } from "../../shared/types";
import { addDays } from "./dates";

export type { DueFilter, IssueFilter } from "../../shared/types";

export const DEFAULT_FILTER: IssueFilter = {
  statuses: ["open", "in_progress", "resolved"],
  assignee: null,
  reporter: null,
  keyword: "",
  due: "all",
  category: null,
  awaitingConfirmation: false,
  labels: [],
  fields: {},
};

const WEEK_DAYS = 7;

const isActive = (i: Issue): boolean => i.status === "open" || i.status === "in_progress";

function matchesDue(i: Issue, due: DueFilter, today: string): boolean {
  switch (due) {
    case "all":
      return true;
    case "none":
      return i.dueDate === null;
    case "overdue":
      return i.dueDate !== null && i.dueDate < today && isActive(i);
    case "week":
      return i.dueDate !== null && i.dueDate >= today && i.dueDate <= addDays(today, WEEK_DAYS) && isActive(i);
  }
}

/** `today` is YYYY-MM-DD; the due conditions compare against it. `me` is the current username for 確認待ち. */
export function filterIssues(issues: Issue[], filter: IssueFilter, today: string, me: string): Issue[] {
  const kw = filter.keyword.trim().toLowerCase();
  return issues.filter(
    (i) =>
      filter.statuses.includes(i.status) &&
      (filter.assignee === null || i.assignee === filter.assignee) &&
      (filter.reporter === null || i.reporter === filter.reporter) &&
      (filter.category === null || i.category === filter.category) &&
      (!filter.awaitingConfirmation || (i.status === "resolved" && i.reporter === me)) &&
      (filter.labels.length === 0 || filter.labels.some((l) => i.labels.includes(l))) &&
      Object.entries(filter.fields).every(([id, v]) => (i.fields[id] ?? "") === v) &&
      matchesDue(i, filter.due, today) &&
      (kw === "" ||
        i.summary.toLowerCase().includes(kw) ||
        i.key.toLowerCase().includes(kw) ||
        i.description.toLowerCase().includes(kw)),
  );
}
