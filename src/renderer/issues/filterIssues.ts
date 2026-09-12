import type { Issue, IssueStatus } from "../../shared/types";

export interface IssueFilter {
  statuses: IssueStatus[];
  assignee: string | null;
  reporter: string | null;
  keyword: string;
}

export const DEFAULT_FILTER: IssueFilter = {
  statuses: ["open", "in_progress", "resolved"],
  assignee: null,
  reporter: null,
  keyword: "",
};

export function filterIssues(issues: Issue[], filter: IssueFilter): Issue[] {
  const kw = filter.keyword.trim().toLowerCase();
  return issues.filter(
    (i) =>
      filter.statuses.includes(i.status) &&
      (filter.assignee === null || i.assignee === filter.assignee) &&
      (filter.reporter === null || i.reporter === filter.reporter) &&
      (kw === "" || i.summary.toLowerCase().includes(kw) || i.key.toLowerCase().includes(kw)),
  );
}
