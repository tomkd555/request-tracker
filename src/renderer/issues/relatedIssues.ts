import type { Issue, IssueStatus, Relation, RelationType } from "../../shared/types";
import { mentionedKeys } from "../app/linkIssueKeys";

/** Issues this one mentions in its description, then issues whose description mentions this one; parent and children excluded. */
export function relatedIssues(issue: Issue, byKey: Map<string, Issue>): Issue[] {
  const isFamily = (k: string): boolean => k === issue.key || k === issue.parentKey;
  const out: Issue[] = [];
  for (const k of mentionedKeys(issue.description)) {
    const other = byKey.get(k);
    if (other && !isFamily(k) && other.parentKey !== issue.key) out.push(other);
  }
  for (const other of byKey.values()) {
    if (isFamily(other.key) || other.parentKey === issue.key || out.includes(other)) continue;
    if (mentionedKeys(other.description).includes(issue.key)) out.push(other);
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
  const outRows: RelationRow[] = [];
  for (const rel of issue.relations) {
    if (rel.key === issue.key) continue;
    const other = byKey.get(rel.key);
    if (other) outRows.push({ direction: "out", type: rel.type, key: other.key, summary: other.summary, status: other.status });
  }
  const inRows: RelationRow[] = [];
  for (const other of byKey.values()) {
    if (other.key === issue.key) continue;
    for (const rel of other.relations) {
      if (rel.key === issue.key) inRows.push({ direction: "in", type: rel.type, key: other.key, summary: other.summary, status: other.status });
    }
  }
  return [...outRows, ...inRows];
}

/** Appends `rel` unless an identical {type, key} pair is already present. */
export function addRelation(relations: Relation[], rel: Relation): Relation[] {
  return relations.some((r) => r.type === rel.type && r.key === rel.key) ? relations : [...relations, rel];
}
