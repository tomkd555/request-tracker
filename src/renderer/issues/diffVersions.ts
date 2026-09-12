import type { Issue } from "../../shared/types";
import { PRIORITY_LABEL, STATUS_LABEL } from "./labels";

/** One saved change of an issue: the lines describing what changed, stamped with the later version. */
export interface ChangeEntry { at: string; by: string; lines: string[] }

const dateOrNone = (v: string | null): string => v ?? "なし";

/** Lines such as 「状態: 未対応 → 処理中」 for every field that differs between two versions. */
export function diffVersions(prev: Issue, next: Issue, nameOf: (username: string | null) => string): string[] {
  const lines: string[] = [];
  const arrow = (label: string, a: string, b: string): void => {
    if (a !== b) lines.push(`${label}: ${a} → ${b}`);
  };
  arrow("件名", prev.summary, next.summary);
  arrow("種別", prev.category || "未設定", next.category || "未設定");
  arrow("状態", STATUS_LABEL[prev.status], STATUS_LABEL[next.status]);
  arrow("優先度", PRIORITY_LABEL[prev.priority], PRIORITY_LABEL[next.priority]);
  arrow("担当者", nameOf(prev.assignee) || "未設定", nameOf(next.assignee) || "未設定");
  arrow("開始日", dateOrNone(prev.startDate), dateOrNone(next.startDate));
  arrow("期限日", dateOrNone(prev.dueDate), dateOrNone(next.dueDate));
  if (prev.description !== next.description) lines.push("詳細を編集");
  return lines;
}

/** Diffs consecutive pairs of `history` (oldest first) ending at `current`; entries with no visible change are dropped. */
export function changeEntries(history: Issue[], current: Issue, nameOf: (username: string | null) => string): ChangeEntry[] {
  const versions = [...history, current];
  const out: ChangeEntry[] = [];
  for (let i = 1; i < versions.length; i++) {
    const lines = diffVersions(versions[i - 1], versions[i], nameOf);
    if (lines.length > 0) out.push({ at: versions[i].updatedAt, by: versions[i].updatedBy, lines });
  }
  return out;
}
