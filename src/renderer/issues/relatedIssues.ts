import type { Issue, IssueStatus, Relation, RelationType } from "../../shared/types";
import { mentionedKeys } from "../app/linkIssueKeys";

/** Issues this one mentions in its description, then issues whose description mentions this one; parent and children excluded. */
export function relatedIssues(issue: Issue, byKey: Map<string, Issue>): Issue[] {
  const family = new Set([issue.key, issue.parentKey ?? ""]);
  const out: Issue[] = [];
  for (const k of mentionedKeys(issue.description)) {
    const i = byKey.get(k);
    if (i && !family.has(k) && i.parentKey !== issue.key) out.push(i);
  }
  for (const i of byKey.values()) {
    if (family.has(i.key) || i.parentKey === issue.key || out.includes(i)) continue;
    if (mentionedKeys(i.description).includes(issue.key)) out.push(i);
  }
  return out;
}

/** A typed row for the 関連課題 section: `direction` says which side wrote the link, and picks the label (RELATION_LABEL for "out", INVERSE_LABEL for "in"). */
export interface RelationRow {
  direction: "out" | "in";
  type: RelationType;
  key: string;
  summary: string;
  status: IssueStatus;
}

/** This issue's own relations, in written order, then the relations other issues wrote naming this one; a key with no record, or naming the issue itself, is dropped. */
export function relationRows(issue: Issue, byKey: Map<string, Issue>): RelationRow[] {
  const out: RelationRow[] = [];
  for (const rel of issue.relations) {
    if (rel.key === issue.key) continue;
    const i = byKey.get(rel.key);
    if (i) out.push({ direction: "out", type: rel.type, key: i.key, summary: i.summary, status: i.status });
  }
  const inRows: RelationRow[] = [];
  for (const i of byKey.values()) {
    if (i.key === issue.key) continue;
    for (const rel of i.relations) {
      if (rel.key === issue.key) inRows.push({ direction: "in", type: rel.type, key: i.key, summary: i.summary, status: i.status });
    }
  }
  return [...out, ...inRows];
}

/** Appends `rel` unless an identical {type, key} pair is already present. */
export function addRelation(relations: Relation[], rel: Relation): Relation[] {
  return relations.some((r) => r.type === rel.type && r.key === rel.key) ? relations : [...relations, rel];
}
