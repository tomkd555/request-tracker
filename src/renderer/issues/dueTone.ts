import type { Issue } from "../../shared/types";
import { addDays } from "./dates";

export type DueTone = "overdue" | "soon" | "none";

const SOON_DAYS = 3;

/** "overdue" when an open or in-progress issue is past its due date; "soon" when due within 3 days from today inclusive. */
export function dueTone(issue: Issue, today: string): DueTone {
  if (issue.dueDate === null || (issue.status !== "open" && issue.status !== "in_progress")) return "none";
  if (issue.dueDate < today) return "overdue";
  if (issue.dueDate <= addDays(today, SOON_DAYS)) return "soon";
  return "none";
}
