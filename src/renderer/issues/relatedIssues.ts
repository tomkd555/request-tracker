import type { Issue } from "../../shared/types";
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
