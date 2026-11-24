import type { DueFilter, Issue, IssueFilter, Milestone, StatusDef } from "../../shared/types";
import { addDays } from "./dates";
import { isActiveStatus, statusKind } from "./labels";

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
  milestone: null,
};

/** The filter a screen opens with: every stage that is not 完了. */
export const defaultFilter = (statuses: StatusDef[]): IssueFilter => ({
  ...EMPTY_FILTER,
  statuses: statuses.filter((s) => s.kind !== "done").map((s) => s.id),
});

const WEEK_DAYS = 7;

function matchesDue(issue: Issue, due: DueFilter, today: string, isActive: boolean): boolean {
  switch (due) {
    case "all":
      return true;
    case "none":
      return issue.dueDate === null;
    case "overdue":
      return issue.dueDate !== null && issue.dueDate < today && isActive;
    case "week":
      return issue.dueDate !== null && issue.dueDate >= today && issue.dueDate <= addDays(today, WEEK_DAYS) && isActive;
  }
}

const matchesMilestone = (issue: Issue, milestone: string | null | undefined, projectMilestones: Milestone[] | undefined): boolean => {
  if (milestone === null || milestone === undefined) return true;
  const id = issue.milestone ?? null;
  // An id the project no longer lists reads as no milestone, when the project's list is given.
  const hasNoMilestone = id === null || (projectMilestones !== undefined && !projectMilestones.some((m) => m.id === id));
  return milestone === "" ? hasNoMilestone : id === milestone;
};

/** Every issue without an assignee, whatever its stage: the filter behind the 担当者未登録 button. */
export const unassignedFilter = (statuses: StatusDef[]): IssueFilter => ({
  ...EMPTY_FILTER,
  assignee: "",
  statuses: statuses.map((s) => s.id),
});

/**
 * `today` is YYYY-MM-DD; the due conditions compare against it. `me` is the current username for 確認待ち. `statuses` is the project's list.
 * `milestones` is the project's list; with it, an issue naming a milestone that is no longer listed counts as having none.
 */
export function filterIssues(issues: Issue[], filter: IssueFilter, today: string, me: string, statuses: StatusDef[], milestones?: Milestone[]): Issue[] {
  const keyword = filter.keyword.trim().toLowerCase();
  return issues.filter(
    (i) =>
      filter.statuses.includes(i.status) &&
      (filter.assignee === null || (filter.assignee === "" ? i.assignee === null || i.assignee === "" : i.assignee === filter.assignee)) &&
      (filter.reporter === null || i.reporter === filter.reporter) &&
      (filter.category === null || i.category === filter.category) &&
      (!filter.awaitingConfirmation || (statusKind(statuses, i.status) === "review" && i.reporter === me)) &&
      (filter.labels.length === 0 || filter.labels.some((l) => i.labels.includes(l))) &&
      Object.entries(filter.fields).every(([id, v]) => (i.fields[id] ?? "") === v) &&
      matchesMilestone(i, filter.milestone, milestones) &&
      matchesDue(i, filter.due, today, isActiveStatus(statuses, i.status)) &&
      (keyword === "" ||
        i.summary.toLowerCase().includes(keyword) ||
        i.key.toLowerCase().includes(keyword) ||
        i.description.toLowerCase().includes(keyword)),
  );
}
