import type { Issue, IssueStatus } from "../../shared/types";

/**
 * A field left `undefined` is left alone (変更しない); `assignee`/`dueDate` take `null` to clear.
 * `addLabel`/`removeLabel` name one ラベル each; a label already present/absent is a no-op for that field.
 */
export interface BulkPatch {
  status?: IssueStatus;
  assignee?: string | null;
  dueDate?: string | null;
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

/** The fields `patch` actually changes on `issue`, or `null` when it changes nothing (so the caller writes nothing). */
export function bulkApply(issue: Issue, patch: BulkPatch): Partial<Issue> | null {
  const out: Partial<Issue> = {};
  if (patch.status !== undefined && patch.status !== issue.status) out.status = patch.status;
  if (patch.assignee !== undefined && patch.assignee !== issue.assignee) out.assignee = patch.assignee;
  if (patch.dueDate !== undefined && patch.dueDate !== issue.dueDate) out.dueDate = patch.dueDate;

  let labels = issue.labels;
  if (patch.addLabel !== undefined && !labels.includes(patch.addLabel)) labels = [...labels, patch.addLabel];
  if (patch.removeLabel !== undefined && labels.includes(patch.removeLabel)) labels = labels.filter((l) => l !== patch.removeLabel);
  if (labels !== issue.labels) out.labels = labels;

  return Object.keys(out).length === 0 ? null : out;
}
