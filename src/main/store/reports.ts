import { isReport, type Report } from "../../shared/types";
import { collection, type Collection } from "./collection";
import { fileStamp } from "./fileStamp";
import type { Layout } from "./paths";

export const reportsCollection = (l: Layout): Collection<Report> =>
  collection<Report>({ dir: l.reports, guard: isReport, historyDir: l.historyReports, trashDir: l.trashReports });

/** The id is the creation stamp; a collision (same millisecond on two clients) retries with the next millisecond, as `createPage` in wiki.ts. */
export async function createReport(l: Layout, report: Report): Promise<Report> {
  const c = reportsCollection(l);
  let at = new Date(report.createdAt).getTime();
  for (let attempt = 0; attempt < 50; attempt++) {
    const createdAt = new Date(at).toISOString();
    const id = fileStamp(createdAt);
    const record = { ...report, id, createdAt };
    try {
      await c.create(id, record);
      return record;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      at += 1;
    }
  }
  throw new Error("could not allocate a report id");
}

export async function putReport(l: Layout, report: Report, expectedUpdatedAt?: string): Promise<void> {
  await reportsCollection(l).put(report.id, report, expectedUpdatedAt);
}

export async function removeReport(l: Layout, id: string): Promise<void> {
  await reportsCollection(l).remove(id);
}
