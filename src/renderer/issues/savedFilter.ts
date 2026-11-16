import type { IssueFilter, Project, SavedFilter } from "../../shared/types";
import { defaultFilter, EMPTY_FILTER } from "./filterIssues";

const sameSet = (a: string[], b: string[]): boolean => {
  const setA = new Set(a);
  const setB = new Set(b);
  return setA.size === setB.size && [...setA].every((v) => setB.has(v));
};

/** Same statuses and ラベル (each as a set, order ignored) and the same 汎用列 values (entry-wise); every other field compares by equality. */
export function sameFilter(a: IssueFilter, b: IssueFilter): boolean {
  if (!sameSet(a.statuses, b.statuses) || !sameSet(a.labels, b.labels)) return false;
  const fieldsA = Object.entries(a.fields);
  const fieldsB = Object.entries(b.fields);
  if (fieldsA.length !== fieldsB.length || !fieldsA.every(([id, v]) => b.fields[id] === v)) return false;
  return (
    a.assignee === b.assignee &&
    a.reporter === b.reporter &&
    a.keyword === b.keyword &&
    a.due === b.due &&
    a.category === b.category &&
    a.awaitingConfirmation === b.awaitingConfirmation &&
    (a.milestone ?? null) === (b.milestone ?? null)
  );
}

/**
 * A saved filter as the bar can show it: a stage deleted since the save is dropped (a filter left with no stage opens on the default set),
 * and so is a 汎用列 condition whose column is gone, has no options, or no longer lists the value; a milestone the project no longer lists reads as null,
 * and so does the field of a filter saved before milestones existed.
 */
export function restoreFilter(saved: IssueFilter, project: Pick<Project, "statuses" | "fields" | "milestones">): IssueFilter {
  const statuses = saved.statuses.filter((id) => project.statuses.some((s) => s.id === id));
  const fields = Object.entries(saved.fields ?? {}).filter(([id, v]) => project.fields.some((f) => f.id === id && f.options.includes(v)));
  const isListed = (project.milestones ?? []).some((m) => m.id === saved.milestone);
  const milestone = saved.milestone === "" || isListed ? saved.milestone : null;
  return { ...EMPTY_FILTER, ...saved, statuses: statuses.length === 0 ? defaultFilter(project.statuses).statuses : statuses, fields: Object.fromEntries(fields), milestone };
}

/** Replaces the row named `name`, or appends a new one. */
export function upsertFilter(saved: SavedFilter[], name: string, filter: IssueFilter): SavedFilter[] {
  const i = saved.findIndex((s) => s.name === name);
  if (i === -1) return [...saved, { name, filter }];
  return saved.map((s, idx) => (idx === i ? { name, filter } : s));
}

export function removeFilter(saved: SavedFilter[], name: string): SavedFilter[] {
  return saved.filter((s) => s.name !== name);
}
