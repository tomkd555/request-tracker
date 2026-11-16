import type { Issue, IssueStatus, StatusDef } from "../../shared/types";

interface Column { status: IssueStatus; cards: Issue[]; hiddenCount: number }

const MAX_CARDS_PER_COLUMN = 50;

/**
 * One column per stage of `statuses` (the project's list, in its order) that `shownStatuses` includes, so the filter's own order never leaks through.
 * Each column's issues are sorted by `compare`, then capped at `maxCards`; whatever is cut becomes `hiddenCount`.
 */
export function columnsOf(issues: Issue[], statuses: StatusDef[], shownStatuses: IssueStatus[], compare: (a: Issue, b: Issue) => number, maxCards = MAX_CARDS_PER_COLUMN): Column[] {
  return statuses
    .filter((s) => shownStatuses.includes(s.id))
    .map(({ id: status }) => {
      const sorted = issues.filter((i) => i.status === status).sort(compare);
      return { status, cards: sorted.slice(0, maxCards), hiddenCount: Math.max(0, sorted.length - maxCards) };
    });
}
