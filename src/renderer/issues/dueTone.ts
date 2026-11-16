import type { Issue, StatusDef } from "../../shared/types";
import { addDays } from "./dates";
import { isActiveStatus } from "./labels";

export type DueTone = "overdue" | "soon" | "none";

/** "overdue" when an active issue is past its due date; "soon" when due within `dueSoonDays` from today inclusive. */
export function dueTone(issue: Issue, today: string, dueSoonDays: number, statuses: StatusDef[]): DueTone {
  if (issue.dueDate === null || !isActiveStatus(statuses, issue.status)) return "none";
  if (issue.dueDate < today) return "overdue";
  if (issue.dueDate <= addDays(today, dueSoonDays)) return "soon";
  return "none";
}
