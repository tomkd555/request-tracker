import type { Issue, IssueStatus } from "../../shared/types";
import { addDays } from "./dates";

export type DueFilter = "all" | "overdue" | "week" | "none";

export interface IssueFilter {
  statuses: IssueStatus[];
  assignee: string | null;
  reporter: string | null;
  keyword: string;
  due: DueFilter;
}

export const DEFAULT_FILTER: IssueFilter = {
  statuses: ["open", "in_progress", "resolved"],
  assignee: null,
  reporter: null,
  keyword: "",
  due: "all",
};

const WEEK_DAYS = 7;

function matchesDue(i: Issue, due: DueFilter, today: string): boolean {
  switch (due) {
    case "all":
      return true;
    case "none":
      return i.dueDate === null;
    case "overdue":
      return i.dueDate !== null && i.dueDate < today && (i.status === "open" || i.status === "in_progress");
    case "week":
      return i.dueDate !== null && i.dueDate >= today && i.dueDate <= addDays(today, WEEK_DAYS);
  }
}

/** `today` is YYYY-MM-DD; the due conditions compare against it. */
export function filterIssues(issues: Issue[], filter: IssueFilter, today: string): Issue[] {
  const kw = filter.keyword.trim().toLowerCase();
  return issues.filter(
    (i) =>
      filter.statuses.includes(i.status) &&
      (filter.assignee === null || i.assignee === filter.assignee) &&
      (filter.reporter === null || i.reporter === filter.reporter) &&
      matchesDue(i, filter.due, today) &&
      (kw === "" ||
        i.summary.toLowerCase().includes(kw) ||
        i.key.toLowerCase().includes(kw) ||
        i.description.toLowerCase().includes(kw)),
  );
}
