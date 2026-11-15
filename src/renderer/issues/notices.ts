import type { Issue, StatusDef } from "../../shared/types";
import { compareKeys } from "./compareKeys";
import { isDoneStatus } from "./labels";
import { unseenFrom } from "./seen";

/**
 * Issues short of 完了 that `me` reports, is assigned or watches and that carry an unseen save, newest save first.
 * The screen and the count in the navigation both read this list.
 */
export function noticesOf(issues: Issue[], watched: ReadonlySet<string>, me: string, statuses: StatusDef[], stampOf: (key: string) => string | null): Issue[] {
  return issues
    .filter((i) => !isDoneStatus(statuses, i.status) && (i.reporter === me || i.assignee === me || watched.has(i.key)) && unseenFrom(i, me, stampOf(i.key)))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || compareKeys(a.key, b.key));
}
