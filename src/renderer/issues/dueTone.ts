import type { Issue } from "../../shared/types";
import { addDays } from "./dates";

export type DueTone = "overdue" | "soon" | "none";

/** "overdue" when an open or in-progress issue is past its due date; "soon" when due within `soonDays` from today inclusive. */
export function dueTone(issue: Issue, today: string, soonDays = 3): DueTone {
  if (issue.dueDate === null || (issue.status !== "open" && issue.status !== "in_progress")) return "none";
  if (issue.dueDate < today) return "overdue";
  if (issue.dueDate <= addDays(today, soonDays)) return "soon";
  return "none";
}
