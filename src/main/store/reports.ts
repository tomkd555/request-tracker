import { isReport, type Report } from "../../shared/types";
import { collection, createWithStampId, type Collection } from "./collection";
import type { Layout } from "./paths";

export const reportsCollection = (layout: Layout): Collection<Report> =>
  collection<Report>({ dir: layout.reports, guard: isReport, historyDir: layout.historyReports, trashDir: layout.trashReports, idOf: (report) => report.id });

/** The id is the creation stamp; a collision (same millisecond on two clients) retries with the next millisecond, as `createPage` in wiki.ts. */
export async function createReport(layout: Layout, report: Report): Promise<Report> {
  return createWithStampId(reportsCollection(layout), new Date(report.createdAt).getTime(), (id, createdAt) => ({ ...report, id, createdAt }), "report");
}

export async function putReport(layout: Layout, report: Report, expectedUpdatedAt?: string): Promise<void> {
  await reportsCollection(layout).put(report.id, report, expectedUpdatedAt);
}

export async function removeReport(layout: Layout, id: string): Promise<void> {
  await reportsCollection(layout).remove(id);
}
