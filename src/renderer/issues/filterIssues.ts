import type { DueFilter, Issue, IssueFilter, StatusDef } from "../../shared/types";
import { addDays } from "./dates";
import { isActiveStatus, statusKind } from "./labels";

export type { DueFilter, IssueFilter } from "../../shared/types";

/** Everything except the statuses, which come from the project's list. */
export const EMPTY_FILTER: Omit<IssueFilter, "statuses"> = {
  assignee: null,
  reporter: null,
  keyword: "",
  due: "all",
  category: null,
  awaitingConfirmation: false,
  labels: [],
  fields: {},
};

/** The filter a screen opens with: every stage that is not 完了. */
export const defaultFilter = (statuses: StatusDef[]): IssueFilter => ({
  ...EMPTY_FILTER,
  statuses: statuses.filter((s) => s.kind !== "done").map((s) => s.id),
});

const WEEK_DAYS = 7;

function matchesDue(i: Issue, due: DueFilter, today: string, active: boolean): boolean {
  switch (due) {
    case "all":
      return true;
    case "none":
      return i.dueDate === null;
    case "overdue":
      return i.dueDate !== null && i.dueDate < today && active;
    case "week":
      return i.dueDate !== null && i.dueDate >= today && i.dueDate <= addDays(today, WEEK_DAYS) && active;
  }
}

/** `today` is YYYY-MM-DD; the due conditions compare against it. `me` is the current username for 確認待ち. `statuses` is the project's list. */
export function filterIssues(issues: Issue[], filter: IssueFilter, today: string, me: string, statuses: StatusDef[]): Issue[] {
  const kw = filter.keyword.trim().toLowerCase();
  return issues.filter(
    (i) =>
      filter.statuses.includes(i.status) &&
      (filter.assignee === null || i.assignee === filter.assignee) &&
      (filter.reporter === null || i.reporter === filter.reporter) &&
      (filter.category === null || i.category === filter.category) &&
      (!filter.awaitingConfirmation || (statusKind(statuses, i.status) === "review" && i.reporter === me)) &&
      (filter.labels.length === 0 || filter.labels.some((l) => i.labels.includes(l))) &&
      Object.entries(filter.fields).every(([id, v]) => (i.fields[id] ?? "") === v) &&
      matchesDue(i, filter.due, today, isActiveStatus(statuses, i.status)) &&
      (kw === "" ||
        i.summary.toLowerCase().includes(kw) ||
        i.key.toLowerCase().includes(kw) ||
        i.description.toLowerCase().includes(kw)),
  );
}
