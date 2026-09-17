import type { IssuePriority, IssueStatus, Project, RelationType } from "../../shared/types";
import { withCurrent } from "../app/UserContext";

export const STATUS_LABEL: Record<IssueStatus, string> = {
  open: "未対応",
  in_progress: "処理中",
  resolved: "処理済み",
  closed: "完了",
};

export const PRIORITY_LABEL: Record<IssuePriority, string> = { high: "高", normal: "中", low: "低" };

const STATUS_MODIFIER: Record<IssueStatus, string> = {
  open: "pill--open",
  in_progress: "pill--in-progress",
  resolved: "pill--resolved",
  closed: "pill--closed",
};

export const statusClass = (status: IssueStatus): string => `pill ${STATUS_MODIFIER[status]}`;

export const LABEL_DEFAULT = "#9aa0a6";

/** The colour of a ラベル by name; grey once the label is renamed or deleted, so the name still reads as a plain chip. */
export function labelColor(project: Project, name: string): string {
  return project.labels.find((l) => l.name === name)?.color ?? LABEL_DEFAULT;
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
