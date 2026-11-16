import type { CustomField, Issue, Milestone, Relation, StatusDef } from "../../shared/types";
import { formatHours } from "./hours";
import { PRIORITY_LABEL, RELATION_LABEL } from "./labels";
import { milestoneName } from "./milestones";

/** History records skip the first-stage fallback, so a stage deleted since the save is named as such rather than as the first stage. */
const statusNameOrDeleted = (statuses: StatusDef[], id: string): string => statuses.find((s) => s.id === id)?.name ?? "削除された状態";

/** One saved change of an issue: the lines describing what changed, stamped with the later version. */
export interface ChangeEntry { at: string; by: string; lines: string[] }

const orNone = (v: string | null): string => v ?? "なし";
const relationsText = (rs: Relation[]): string =>
  rs.length === 0 ? "なし" : rs.map((r) => `${RELATION_LABEL[r.type]} ${r.key}`).sort().join("、");

/** Lines such as 「状態: 未対応 → 処理中」 for every field that differs between two versions; `fields` names the 汎用列 to compare, `statuses` names the stages, `milestones` the マイルストーン. */
export function diffVersions(prev: Issue, next: Issue, nameOf: (username: string | null) => string, fields: CustomField[], statuses: StatusDef[], milestones: Milestone[] = []): string[] {
  const lines: string[] = [];
  const addChange = (label: string, a: string, b: string): void => {
    if (a !== b) lines.push(`${label}: ${a} → ${b}`);
  };
  addChange("件名", prev.summary, next.summary);
  addChange("種別", prev.category || "未設定", next.category || "未設定");
  addChange("ラベル", prev.labels.join(" "), next.labels.join(" "));
  if (prev.status !== next.status) lines.push(`状態: ${statusNameOrDeleted(statuses, prev.status)} → ${statusNameOrDeleted(statuses, next.status)}`);
  addChange("優先度", PRIORITY_LABEL[prev.priority], PRIORITY_LABEL[next.priority]);
  addChange("担当者", nameOf(prev.assignee) || "未設定", nameOf(next.assignee) || "未設定");
  addChange("開始日", orNone(prev.startDate), orNone(next.startDate));
  addChange("期限日", orNone(prev.dueDate), orNone(next.dueDate));
  addChange("親課題", orNone(prev.parentKey), orNone(next.parentKey));
  addChange("マイルストーン", milestoneName(milestones, prev.milestone) || "未設定", milestoneName(milestones, next.milestone) || "未設定");
  addChange("予定時間", formatHours(prev.estimatedHours) || "なし", formatHours(next.estimatedHours) || "なし");
  addChange("実績時間", formatHours(prev.actualHours) || "なし", formatHours(next.actualHours) || "なし");
  addChange("関連", relationsText(prev.relations), relationsText(next.relations));
  for (const f of fields) addChange(f.name, prev.fields[f.id] || "未設定", next.fields[f.id] || "未設定");
  if (prev.description !== next.description) lines.push("詳細を編集");
  return lines;
}

/** Diffs consecutive pairs of `history` (oldest first) ending at `current`; entries with no visible change are dropped. */
export function changeEntries(history: Issue[], current: Issue, nameOf: (username: string | null) => string, fields: CustomField[], statuses: StatusDef[], milestones: Milestone[] = []): ChangeEntry[] {
  const versions = [...history, current];
  const out: ChangeEntry[] = [];
  for (let i = 1; i < versions.length; i++) {
    const lines = diffVersions(versions[i - 1], versions[i], nameOf, fields, statuses, milestones);
    if (lines.length > 0) out.push({ at: versions[i].updatedAt, by: versions[i].updatedBy, lines });
  }
  return out;
}
