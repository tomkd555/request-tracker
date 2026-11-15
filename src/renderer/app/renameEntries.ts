import type { Issue } from "../../shared/types";

export interface Rename { from: string; to: string }

/**
 * The entries of a 種別 or ラベル list that were renamed: same position, different name. The editor's rows carry no id,
 * so a name that still exists on the other side marks a move or a swap, and a removed entry shifts the rest: none of these is a rename.
 * An entry replaced in place by a new name reads as a rename too; the confirmation names each pair, so the user can decline.
 */
export function renamedEntries(oldNames: string[], newNames: string[]): Rename[] {
  const kept = new Set(newNames.map((n) => n.trim()));
  const before = new Set(oldNames);
  const renames: Rename[] = [];
  oldNames.forEach((from, i) => {
    const to = (newNames[i] ?? "").trim();
    if (to !== "" && to !== from && !kept.has(from) && !before.has(to)) renames.push({ from, to });
  });
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
  const to = new Map(renames.map((r) => [r.from, r.to]));
  const counts = renames.map((rename) => ({
    rename,
    count: issues.filter((i) => (field === "category" ? i.category === rename.from : i.labels.includes(rename.from))).length,
  }));
  const changed: Issue[] = [];
  for (const issue of issues) {
    if (field === "category") {
      const next = to.get(issue.category);
      if (next !== undefined) changed.push({ ...issue, category: next });
    } else if (issue.labels.some((l) => to.has(l))) {
      const labels = issue.labels.map((l) => to.get(l) ?? l);
      changed.push({ ...issue, labels: labels.filter((l, i) => labels.indexOf(l) === i) });
    }
  }
  return { counts, changed };
}
