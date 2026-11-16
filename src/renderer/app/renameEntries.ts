import type { Issue } from "../../shared/types";

export interface Rename { from: string; to: string }

/** A row of the 種別 or ラベル editor: `savedName` is the name the row was loaded with, null for a row added in the editor. */
export interface NamedRow { savedName: string | null; name: string }

/**
 * The entries of a 種別 or ラベル list that were renamed: a row loaded under one name and saved under another, whatever
 * rows were removed, added or moved around it. `oldNames` is the list before the edit. A new name that the list held
 * before marks a swap, and an old name that the list still holds marks a row retyped beside its own name: neither is a rename.
 */
export function renamedEntries(oldNames: string[], rows: NamedRow[]): Rename[] {
  const newNameSet = new Set(rows.map((row) => row.name.trim()));
  const oldNameSet = new Set(oldNames);
  const renames: Rename[] = [];
  for (const row of rows) {
    const from = row.savedName;
    const to = row.name.trim();
    if (from !== null && to !== "" && to !== from && !newNameSet.has(from) && !oldNameSet.has(to)) renames.push({ from, to });
  }
  return renames;
}

export interface RenamePlan {
  /** Per rename, how many issues use the old name. */
  counts: { rename: Rename; count: number }[];
  /** The issues with the new names in place, in the order given; the caller stamps the save. */
  changed: Issue[];
}

/** Which issues carry an old name and what they become; `field` is the issue field the list belongs to. */
export function renamePlan(issues: Issue[], renames: Rename[], field: "category" | "labels"): RenamePlan {
  const newNameOf = new Map(renames.map((r) => [r.from, r.to]));
  const counts = renames.map((rename) => ({
    rename,
    count: issues.filter((i) => (field === "category" ? i.category === rename.from : i.labels.includes(rename.from))).length,
  }));
  const changed: Issue[] = [];
  for (const issue of issues) {
    if (field === "category") {
      const next = newNameOf.get(issue.category);
      if (next !== undefined) changed.push({ ...issue, category: next });
    } else if (issue.labels.some((l) => newNameOf.has(l))) {
      const labels = issue.labels.map((l) => newNameOf.get(l) ?? l);
      changed.push({ ...issue, labels: labels.filter((l, i) => labels.indexOf(l) === i) });
    }
  }
  return { counts, changed };
}
