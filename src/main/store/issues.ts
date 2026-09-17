import { promises as fsp } from "node:fs";
import type { IssueDraft } from "../../shared/api";
import { isIssue, type Issue, type Project } from "../../shared/types";
import { allocateKey, keyOfFileName } from "./allocateKey";
import { collection, mkdirp, readDir, type Collection } from "./collection";
import { fiscalYearOf, fiscalYy } from "../../shared/fiscalYear";
import type { Layout } from "./paths";

export const issuesCollection = (l: Layout): Collection<Issue> =>
  collection<Issue>({ dir: l.issues, guard: isIssue, historyDir: l.historyIssues, trashDir: l.trashIssues });

async function keysIn(dir: string): Promise<string[]> {
  try {
    return (await fsp.readdir(dir)).map(keyOfFileName).filter((k): k is string => k !== null);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

export const HAS_CHILDREN = "has-children";

/** Moves the record to trash; refused while any issue still names it as parent. The attachments folder stays. */
export async function removeIssue(l: Layout, key: string): Promise<void> {
  const c = issuesCollection(l);
  if ((await readDir(l.issues, isIssue)).some((i) => i.parentKey === key)) throw new Error(HAS_CHILDREN); // uncached: the guard must see the share as it is
  await c.remove(key);
}

/** Allocates the key from issues/ and trash/issues/, creates the record exclusively, and makes the attachments folder. */
export async function createIssue(l: Layout, project: Project, draft: IssueDraft): Promise<Issue> {
  const yy = fiscalYy(fiscalYearOf(draft.createdAt, project.fiscalYearStartMonth));
  const c = issuesCollection(l);
  for (let attempt = 0; attempt < 100; attempt++) {
    const used = [...(await keysIn(l.issues)), ...(await keysIn(l.trashIssues))];
    const key = allocateKey(used, yy);
    const issue: Issue = { ...draft, key }; // key last: IPC arguments arrive untyped
    try {
      await c.create(key, issue);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw e;
    }
    await mkdirp(l.attachments(key));
    return issue;
  }
  throw new Error("could not allocate an issue key");
}
