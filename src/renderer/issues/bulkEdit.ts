import type { Issue, IssueStatus } from "../../shared/types";

/**
 * A field left `undefined` is left alone (変更しない); `assignee`/`dueDate`/`milestone` take `null` to clear.
 * `addLabel`/`removeLabel` name one ラベル each; a label already present/absent is a no-op for that field.
 */
export interface BulkPatch {
  status?: IssueStatus;
  assignee?: string | null;
  dueDate?: string | null;
  /** A Milestone.id; null clears it. */
  milestone?: string | null;
  addLabel?: string;
  removeLabel?: string;
}

/** Above this many selected rows, 実行 is disabled. */
export const BULK_MAX = 100;

/** One result of an attempted 一括編集 write. */
export interface BulkResult {
  key: string;
  ok: boolean;
  message: string;
}

/** The selection after 全選択: cleared when every row up to `BULK_MAX` of `visibleKeys` is already selected, else those rows. */
export function toggleAllSelection(selected: Set<string>, visibleKeys: string[]): Set<string> {
  const capped = visibleKeys.slice(0, BULK_MAX);
  return capped.every((k) => selected.has(k)) ? new Set() : new Set(capped);
}

/** The selected keys that are among `visibleKeys`; a row hidden by a filter leaves the selection. */
export function keepVisible(selected: Set<string>, visibleKeys: string[]): Set<string> {
  const visible = new Set(visibleKeys);
  return new Set([...selected].filter((k) => visible.has(k)));
}

/** The fields `patch` actually changes on `issue`, or `null` when it changes nothing (so the caller writes nothing). */
export function bulkApply(issue: Issue, patch: BulkPatch): Partial<Issue> | null {
  const out: Partial<Issue> = {};
  if (patch.status !== undefined && patch.status !== issue.status) out.status = patch.status;
  if (patch.assignee !== undefined && patch.assignee !== issue.assignee) out.assignee = patch.assignee;
  if (patch.dueDate !== undefined && patch.dueDate !== issue.dueDate) out.dueDate = patch.dueDate;
  if (patch.milestone !== undefined && patch.milestone !== (issue.milestone ?? null)) out.milestone = patch.milestone;

  let labels = issue.labels;
  if (patch.addLabel !== undefined && !labels.includes(patch.addLabel)) labels = [...labels, patch.addLabel];
  if (patch.removeLabel !== undefined && labels.includes(patch.removeLabel)) labels = labels.filter((l) => l !== patch.removeLabel);
  if (labels !== issue.labels) out.labels = labels;

  return Object.keys(out).length === 0 ? null : out;
}
