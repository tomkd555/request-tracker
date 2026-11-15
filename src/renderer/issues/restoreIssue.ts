import { parentRefusal } from "../../shared/issueTree";
import type { Issue } from "../../shared/types";

/**
 * The fields 戻す writes from the version `old`. 親課題 returns with the rest when the tree rules allow it and the old parent still exists;
 * otherwise the current parent stays and `parentKept` is true, so the screen can say so.
 */
export function restorePatch(current: Issue, old: Issue, issues: Issue[]): { patch: Partial<Issue>; parentKept: boolean } {
  const patch: Partial<Issue> = {
    summary: old.summary,
    description: old.description,
    category: old.category,
    labels: old.labels,
    status: old.status,
    priority: old.priority,
    assignee: old.assignee,
    startDate: old.startDate,
    dueDate: old.dueDate,
    fields: old.fields,
    relations: old.relations,
    milestone: old.milestone ?? null,
    estimatedHours: old.estimatedHours ?? null,
    actualHours: old.actualHours ?? null,
  };
  if (old.parentKey === current.parentKey) return { patch, parentKept: false };
  const allowed = old.parentKey === null || (issues.some((i) => i.key === old.parentKey) && parentRefusal(issues, current.key, old.parentKey) === null);
  if (allowed) patch.parentKey = old.parentKey;
  return { patch, parentKept: !allowed };
}
