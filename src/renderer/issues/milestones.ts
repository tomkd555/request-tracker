import type { Milestone } from "../../shared/types";

/** Due date ascending with no due date last, then name; the order of the Gantt groups and of the マイルストーン sort. */
export function orderMilestones(milestones: Milestone[]): Milestone[] {
  return [...milestones].sort((a, b) => {
    if (a.dueDate === b.dueDate) return a.name.localeCompare(b.name, "ja");
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  });
}

/** What the issue's select offers: the open milestones, plus the issue's current one when it is closed. */
export const selectableMilestones = (milestones: Milestone[], currentId: string | null | undefined): Milestone[] =>
  milestones.filter((m) => !m.closed || m.id === currentId);

/** The name of a listed milestone; empty for no milestone and for an id the project no longer lists. */
export const milestoneName = (milestones: Milestone[], id: string | null | undefined): string => milestones.find((m) => m.id === id)?.name ?? "";
