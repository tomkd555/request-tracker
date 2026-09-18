import type { Issue, IssueStatus, StatusDef } from "../../shared/types";

export interface Column { status: IssueStatus; cards: Issue[]; overflow: number }

const LIMIT = 50;

/**
 * One column per stage of `statuses` (the project's list, in its order) that `shown` includes, so the filter's own order never leaks through.
 * Each column's issues are sorted by `compare`, then capped at `limit`; whatever is cut becomes `overflow`.
 */
export function columnsOf(issues: Issue[], statuses: StatusDef[], shown: IssueStatus[], compare: (a: Issue, b: Issue) => number, limit = LIMIT): Column[] {
  return statuses
    .filter((s) => shown.includes(s.id))
    .map(({ id: status }) => {
      const sorted = issues.filter((i) => i.status === status).sort(compare);
      return { status, cards: sorted.slice(0, limit), overflow: Math.max(0, sorted.length - limit) };
    });
}
