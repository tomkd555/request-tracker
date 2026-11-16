import type { Issue, IssueStatus } from "../../shared/types";

/**
 * A field left `undefined` is left alone (変更しない); `assignee`/`dueDate`/`milestone` take `null` to clear.
 * `labelToAdd`/`labelToRemove` name one ラベル each; a label already present/absent is a no-op for that field.
 */
export interface BulkPatch {
  status?: IssueStatus;
  assignee?: string | null;
  dueDate?: string | null;
  /** A Milestone.id; null clears it. */
  milestone?: string | null;
  labelToAdd?: string;
  labelToRemove?: string;
}

/** Above this many selected rows, 実行 is disabled. */
export const MAX_BULK_ROWS = 100;

/** One result of an attempted 一括編集 write. */
export interface BulkResult {
  key: string;
  ok: boolean;
  message: string;
}

/** The selection after 全選択: cleared when every row up to `MAX_BULK_ROWS` of `visibleKeys` is already selected, else those rows. */
export function toggleAllSelection(selected: Set<string>, visibleKeys: string[]): Set<string> {
  const capped = visibleKeys.slice(0, MAX_BULK_ROWS);
  return capped.every((k) => selected.has(k)) ? new Set() : new Set(capped);
}

/** The selected keys that are among `visibleKeys`; a row hidden by a filter leaves the selection. */
export function keepVisible(selected: Set<string>, visibleKeys: string[]): Set<string> {
  const visible = new Set(visibleKeys);
  return new Set([...selected].filter((k) => visible.has(k)));
}

/** The fields `patch` actually changes on `issue`, or `null` when it changes nothing (so the caller writes nothing). */
export function bulkChanges(issue: Issue, patch: BulkPatch): Partial<Issue> | null {
  const changes: Partial<Issue> = {};
  if (patch.status !== undefined && patch.status !== issue.status) changes.status = patch.status;
  if (patch.assignee !== undefined && patch.assignee !== issue.assignee) changes.assignee = patch.assignee;
  if (patch.dueDate !== undefined && patch.dueDate !== issue.dueDate) changes.dueDate = patch.dueDate;
  if (patch.milestone !== undefined && patch.milestone !== (issue.milestone ?? null)) changes.milestone = patch.milestone;

  let labels = issue.labels;
  if (patch.labelToAdd !== undefined && !labels.includes(patch.labelToAdd)) labels = [...labels, patch.labelToAdd];
  if (patch.labelToRemove !== undefined && labels.includes(patch.labelToRemove)) labels = labels.filter((l) => l !== patch.labelToRemove);
  // By content: adding and removing the same absent label rebuilds an equal list, which must write nothing.
  if (labels.length !== issue.labels.length || labels.some((l, i) => l !== issue.labels[i])) changes.labels = labels;

  return Object.keys(changes).length === 0 ? null : changes;
}
