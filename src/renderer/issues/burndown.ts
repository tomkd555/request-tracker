import type { Issue, Milestone, StatusDef } from "../../shared/types";
import { compareText } from "./compareKeys";
import { addDays, ymd } from "./dates";
import { round2 } from "./hours";
import { statusKind } from "./labels";

/** One day of the burndown: the issues of the milestone short of 完了 that day and the sum of their 予定時間. */
export interface BurndownRow { day: string; open: number; hours: number }

const byUpdatedAt = (a: Issue, b: Issue): number => compareText(a.updatedAt, b.updatedAt);

/**
 * One row per day from the start date (else the earliest creation among the milestone's issues) to the due date (else today).
 * An issue's state on a day is its last version saved on or before that day in local time; before its first version it does not count.
 * `versions` holds each issue's versions, history plus the current record.
 */
export function burndownRows(milestone: Milestone, versions: Issue[][], statuses: StatusDef[], today: string): BurndownRow[] {
  const versionLists = versions.filter((vs) => vs.some((v) => v.milestone === milestone.id)).map((vs) => [...vs].sort(byUpdatedAt));
  if (versionLists.length === 0) return [];
  const createdDays = versionLists.map((vs) => ymd(new Date(vs[0].createdAt))).sort();
  const start = milestone.startDate ?? createdDays[0];
  const end = milestone.dueDate ?? today;
  const savedDays = versionLists.map((vs) => vs.map((v) => ymd(new Date(v.updatedAt))));
  const rows: BurndownRow[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) {
    let open = 0;
    let hours = 0;
    versionLists.forEach((vs, i) => {
      let state: Issue | null = null;
      for (let j = 0; j < vs.length && savedDays[i][j] <= day; j++) state = vs[j];
      if (state === null || state.milestone !== milestone.id || statusKind(statuses, state.status) === "done") return;
      open++;
      hours += state.estimatedHours ?? 0;
    });
    rows.push({ day, open, hours: round2(hours) });
  }
  return rows;
}

/** At most this many history reads are in flight. */
const HISTORY_CONCURRENCY = 8;

/** The versions (history plus current, oldest first) of each issue whose current record carries the milestone or whose history ever did. */
export async function loadMilestoneVersions(
  issues: Issue[],
  milestoneId: string,
  history: (key: string) => Promise<Issue[]>,
  concurrency = HISTORY_CONCURRENCY,
): Promise<Issue[][]> {
  const out: (Issue[] | null)[] = new Array<Issue[] | null>(issues.length).fill(null);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < issues.length) {
      const i = next++;
      const vs = [...(await history(issues[i].key)), issues[i]].sort(byUpdatedAt);
      if (vs.some((v) => v.milestone === milestoneId)) out[i] = vs;
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, issues.length) }, worker));
  return out.filter((vs): vs is Issue[] => vs !== null);
}
