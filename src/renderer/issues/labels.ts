import type { CSSProperties } from "react";
import type { Issue, IssuePriority, IssueStatus, Project, RelationType, StatusDef, StatusKind } from "../../shared/types";
import { PALETTE, textOn } from "../app/theme";
import { withCurrent } from "../app/UserContext";

export const PRIORITY_LABEL: Record<IssuePriority, string> = { high: "高", normal: "中", low: "低" };

export const KIND_LABEL: Record<StatusKind, string> = { active: "活動中", review: "確認待ち", done: "完了" };

/** The stage by id; an id no longer in the list reads as the first stage. */
export const statusOf = (statuses: StatusDef[], id: IssueStatus): StatusDef => statuses.find((s) => s.id === id) ?? statuses[0];

/** Issues whose stage left the list, rewritten to the first stage; the id on disk changes on their next save. */
export function withKnownStatus(issues: Issue[], statuses: StatusDef[]): Issue[] {
  return issues.map((i) => (statuses.some((s) => s.id === i.status) ? i : { ...i, status: statuses[0].id }));
}

export const statusKind = (statuses: StatusDef[], id: IssueStatus): StatusKind => statusOf(statuses, id).kind;
export const statusName = (statuses: StatusDef[], id: IssueStatus): string => statusOf(statuses, id).name;
export const isActiveStatus = (statuses: StatusDef[], id: IssueStatus): boolean => statusKind(statuses, id) === "active";
export const isDoneStatus = (statuses: StatusDef[], id: IssueStatus): boolean => statusKind(statuses, id) === "done";
export const firstOfKind = (statuses: StatusDef[], kind: StatusKind): StatusDef | undefined => statuses.find((s) => s.kind === kind);

/** Pill colours of a stage, the way ラベル chips are coloured. */
export function statusStyle(statuses: StatusDef[], id: IssueStatus): CSSProperties {
  const { color } = statusOf(statuses, id);
  return { background: color, color: textOn(color) };
}

export const LABEL_DEFAULT = "#9aa0a6";

/** The colour of a ラベル by name; grey once the label is renamed or deleted, so the name still reads as a plain chip. */
export function labelColor(project: Project, name: string): string {
  return project.labels.find((l) => l.name === name)?.color ?? LABEL_DEFAULT;
}

/** The saved colour of a 種別, or a preset by its position in the list; grey once the 種別 is gone. */
export function categoryColor(project: Project, name: string): string {
  const saved = project.categoryColors[name];
  if (saved) return saved;
  const i = project.categories.indexOf(name);
  return i === -1 ? LABEL_DEFAULT : PALETTE[i % PALETTE.length].hex;
}

/** Adds `name` to the selected set, or removes it when it is already there. */
export function toggleLabel(names: string[], name: string): string[] {
  return names.includes(name) ? names.filter((n) => n !== name) : [...names, name];
}

/** The project's ラベル names plus any name in `current` that is no longer among them, so an orphaned label stays selectable. */
export function labelOptions(project: Project, current: string[]): string[] {
  return current.reduce((opts, name) => withCurrent(opts, name), project.labels.map((l) => l.name));
}

export const formatDate = (iso: string | null): string => (iso ? iso.slice(0, 10) : "");
export const formatDateTime = (iso: string): string => {
  const d = new Date(iso);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** The label on the side that writes the link. */
export const RELATION_LABEL: Record<RelationType, string> = { relates: "関連", duplicates: "重複", precedes: "先行" };
/** The label on the derived, opposite side. */
export const INVERSE_LABEL: Record<RelationType, string> = { relates: "関連", duplicates: "重複", precedes: "後続" };
