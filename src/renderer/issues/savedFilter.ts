import type { IssueFilter, SavedFilter } from "../../shared/types";

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
  return a.assignee === b.assignee && a.reporter === b.reporter && a.keyword === b.keyword && a.due === b.due && a.category === b.category && a.awaitingConfirmation === b.awaitingConfirmation;
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
