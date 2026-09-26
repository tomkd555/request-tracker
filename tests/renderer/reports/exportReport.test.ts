import { expect, test } from "vitest";
import type { ReportContext } from "../../../src/renderer/reports/blocks";
import { reportToHtml, reportToMarkdown } from "../../../src/renderer/reports/exportReport";
import { REPORT_CSS } from "../../../src/renderer/reports/reportCss";
import { DEFAULT_STATUSES, type Issue, type Project, type Report, type User } from "../../../src/shared/types";

const issue = (over: Partial<Issue>): Issue => ({
  key: "26-0001",
  summary: "サーバー不調",
  description: "",
  category: "不具合",
  status: "in_progress",
  priority: "normal",
  assignee: "bob",
  reporter: "alice",
  parentKey: null,
  startDate: "2026-09-01",
  dueDate: "2026-09-10",
  createdAt: "2026-09-01T03:00:00.000Z",
  updatedAt: "2026-09-05T03:00:00.000Z",
  updatedBy: "alice",
  fields: {},
  labels: [],
  relations: [],
  ...over,
});

const project: Project = {
  fiscalYearStartMonth: 4,
  createdAt: "2026-01-01T00:00:00.000Z",
  categories: ["不具合"],
  categoryColors: {},
  categoryTemplates: {},
  fields: [],
  labels: [],
  statuses: DEFAULT_STATUSES,
};

const alice: User = { username: "alice", displayName: "佐藤", createdAt: "2026-01-01T00:00:00.000Z" };
const bob: User = { username: "bob", displayName: "鈴木", createdAt: "2026-01-01T00:00:00.000Z" };
const users: User[] = [alice, bob];

const ctx: ReportContext = { issues: [issue({})], users, project, me: alice, today: "2026-09-15" };

const report: Report = {
  id: "20260915T000000000Z",
  title: "月次報告",
  body: [
    "作成日: {{today}}",
    "",
    '::issues {"columns":["key","summary","assignee"]}',
    "",
    '::summary {"mode":"now","tables":["status"]}',
    "",
    '::gantt {"month":"2026-09","months":1}',
  ].join("\n"),
  isTemplate: false,
  terms: { 処理中: "対応中" },
  issueNotes: {},
  createdAt: "2026-09-15T00:00:00.000Z",
  createdBy: "alice",
  updatedAt: "2026-09-15T00:00:00.000Z",
  updatedBy: "alice",
};

test("reportToMarkdown expands variables, tables the issues, summary and gantt blocks, and applies a term substitution", () => {
  const md = reportToMarkdown(report, ctx);
  expect(md).toContain("作成日: 2026/09/15");
  expect(md).toContain("| キー | 件名 | 担当者 |");
  expect(md).toContain("| 26-0001 | サーバー不調 | 鈴木 |");
  expect(md).toContain("対応中"); // 処理中 -> 対応中 via report.terms, in the summary block's status table
  expect(md).toContain("| キー | 件名 | 担当者 | 開始日 | 期限日 |");
});

test("reportToHtml embeds the title, a rendered table cell and the stylesheet", () => {
  const html = reportToHtml(report, ctx);
  expect(html).toContain("<title>月次報告</title>");
  expect(html).toContain("<td>サーバー不調</td>");
  expect(html).toContain(REPORT_CSS);
});
