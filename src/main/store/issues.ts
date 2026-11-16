import { promises as fsp } from "node:fs";
import type { IssueDraft } from "../../shared/api";
import { isIssue, type Issue, type Project } from "../../shared/types";
import { allocateKey, keyOfFileName } from "./allocateKey";
import { collection, errorCode, mkdirp, readRecords, type Collection } from "./collection";
import { fiscalYearOf, fiscalYy } from "../../shared/fiscalYear";
import { parentRefusal } from "../../shared/issueTree";
import type { Layout } from "./paths";

export const issuesCollection = (layout: Layout): Collection<Issue> =>
  collection<Issue>({ dir: layout.issues, guard: isIssue, historyDir: layout.historyIssues, trashDir: layout.trashIssues, idOf: (issue) => issue.key });

/** The issues as the share holds them now, past the listing cache: a check that guards a write must see the latest files. */
export const readIssuesUncached = (layout: Layout): Promise<Issue[]> => readRecords(layout.issues, isIssue, (issue) => issue.key);

async function issueKeysIn(dir: string): Promise<string[]> {
  try {
    return (await fsp.readdir(dir)).map(keyOfFileName).filter((key): key is string => key !== null);
  } catch (e) {
    if (errorCode(e) === "ENOENT") return [];
    throw e;
  }
}

export const HAS_CHILDREN = "has-children";

/** Rejects with "cycle" or "too-deep" (see parentRefusal) when the parent named would break the tree; a parent that no longer exists is kept. */
async function assertParent(layout: Layout, key: string | null, parentKey: string | null): Promise<void> {
  if (parentKey === null) return;
  const issues = await readIssuesUncached(layout);
  if (!issues.some((issue) => issue.key === parentKey)) return;
  const refusal = parentRefusal(issues, key, parentKey);
  if (refusal !== null) throw new Error(refusal);
}

export async function putIssue(layout: Layout, issue: Issue, expectedUpdatedAt?: string): Promise<void> {
  await assertParent(layout, issue.key, issue.parentKey);
  await issuesCollection(layout).put(issue.key, issue, expectedUpdatedAt);
}

/** Moves the record to trash; refused while any issue still names it as parent. The attachments folder stays. */
export async function removeIssue(layout: Layout, key: string): Promise<void> {
  const hasChildren = (await readIssuesUncached(layout)).some((issue) => issue.parentKey === key);
  if (hasChildren) throw new Error(HAS_CHILDREN);
  await issuesCollection(layout).remove(key);
}

const MAX_KEY_ATTEMPTS = 100;

/** Allocates the key from issues/ and trash/issues/, creates the record exclusively, and makes the attachments folder. */
export async function createIssue(layout: Layout, project: Project, draft: IssueDraft): Promise<Issue> {
  const yy = fiscalYy(fiscalYearOf(draft.createdAt, project.fiscalYearStartMonth));
  await assertParent(layout, null, draft.parentKey);
  const issues = issuesCollection(layout);
  for (let attempt = 0; attempt < MAX_KEY_ATTEMPTS; attempt++) {
    const usedKeys = [...(await issueKeysIn(layout.issues)), ...(await issueKeysIn(layout.trashIssues))];
    const key = allocateKey(usedKeys, yy);
    const issue: Issue = { ...draft, key }; // key last: IPC arguments arrive untyped
    try {
      await issues.create(key, issue);
    } catch (e) {
      if (errorCode(e) === "EEXIST") continue; // another client took the key between the listing and the create
      throw e;
    }
    // The record is saved; a rejection here would make the caller retry a create that already succeeded.
    await mkdirp(layout.attachments(key)).catch((e: unknown) => console.error(`store: attachments folder not created: ${layout.attachments(key)}`, e));
    return issue;
  }
  throw new Error("could not allocate an issue key");
}
