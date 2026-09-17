import { ISSUE_STATUSES, type Issue, type IssueStatus } from "../../shared/types";

export interface Column { status: IssueStatus; cards: Issue[]; overflow: number }

const LIMIT = 50;

/**
 * One column per status in `statuses`, ordered by ISSUE_STATUSES (so a caller's own order never leaks through).
 * Each column's issues are sorted by `compare`, then capped at `limit`; whatever is cut becomes `overflow`.
 */
export function columnsOf(issues: Issue[], statuses: IssueStatus[], compare: (a: Issue, b: Issue) => number, limit = LIMIT): Column[] {
  return ISSUE_STATUSES.filter((status) => statuses.includes(status)).map((status) => {
    const sorted = issues.filter((i) => i.status === status).sort(compare);
    return { status, cards: sorted.slice(0, limit), overflow: Math.max(0, sorted.length - limit) };
  });
}
