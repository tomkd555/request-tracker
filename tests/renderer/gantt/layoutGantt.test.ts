import { expect, test } from "vitest";
import { daysOf, layoutGantt, monthsOf, rangeFor, shiftMonth, type LayoutOptions } from "../../../src/renderer/gantt/layoutGantt";
import { DEFAULT_STATUSES, type Issue } from "../../../src/shared/types";

const issue = (over: Partial<Issue>): Issue => ({
  key: "26-0001",
  summary: "",
  description: "",
  category: "",
  status: "open",
  priority: "normal",
  assignee: null,
  reporter: "alice",
  parentKey: null,
  startDate: null,
  dueDate: null,
  createdAt: "2026-09-10T03:00:00.000Z",
  updatedAt: "",
  updatedBy: "",
  fields: {},
  labels: [],
  relations: [],
  ...over,
});

const range = rangeFor("2026-09", 1);
const opts: LayoutOptions = { today: "2026-09-12", groupBy: "none", collapsed: new Set(), includeUndated: false, statuses: DEFAULT_STATUSES };
const rows = (issues: Issue[], o: Partial<LayoutOptions> = {}, r = range) => layoutGantt(issues, r, { ...opts, ...o }).groups.flatMap((g) => g.rows);

test("a range covers whole months; the header has one cell per month and marks weekends and Mondays", () => {
  expect(range).toEqual({ start: "2026-09-01", end: "2026-09-30" });
  expect(rangeFor("2026-11", 3)).toEqual({ start: "2026-11-01", end: "2027-01-31" });
  expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  const days = daysOf(rangeFor("2026-09", 2));
  expect(days).toHaveLength(61);
  expect(days[4]).toMatchObject({ day: "2026-09-05", col: 4, weekend: true, monday: false });
  expect(days[6]).toMatchObject({ day: "2026-09-07", monday: true });
  expect(monthsOf(days)).toEqual([
    { label: "2026年9月", startCol: 0, span: 30 },
    { label: "2026年10月", startCol: 30, span: 31 },
  ]);
});

test("a bar spans start to due inclusive; an open issue past its due date gets a late segment up to today", () => {
  const [r] = rows([issue({ startDate: "2026-09-01", dueDate: "2026-09-05" })]);
  expect(r).toMatchObject({ kind: "bar", bar: { startCol: 0, span: 5 }, late: { startCol: 5, span: 7 }, tone: "overdue" });
  const l = layoutGantt([issue({ startDate: "2026-09-01", dueDate: "2026-09-05" })], range, opts);
  expect(l.todayCol).toBe(11);
});

test("clipping at both ends; a bar entirely outside the range is absent", () => {
  expect(rows([issue({ startDate: "2026-08-01", dueDate: "2026-09-02" })])[0].bar).toEqual({ startCol: 0, span: 2 });
  expect(rows([issue({ startDate: "2026-09-29", dueDate: "2026-11-30" })])[0]).toMatchObject({ bar: { startCol: 28, span: 2 }, tone: "normal" });
  expect(rows([issue({ startDate: "2026-11-01", dueDate: "2026-11-02" })])).toEqual([]);
});

test("only a due date starts at the created day; only a start date is a point; no dates is absent unless asked", () => {
  expect(rows([issue({ dueDate: "2026-09-11" })])[0]).toMatchObject({ kind: "bar", bar: { startCol: 9, span: 2 }, tone: "overdue" });
  expect(rows([issue({ startDate: "2026-09-20" })])[0]).toMatchObject({ kind: "point", bar: { startCol: 19, span: 1 }, late: null });
  expect(rows([issue({})])).toEqual([]);
  expect(rows([issue({})], { includeUndated: true })[0]).toMatchObject({ kind: "none", bar: null });
});

test("closed and resolved issues are muted with no late segment; a due date before the start date draws one day", () => {
  expect(rows([issue({ dueDate: "2026-09-11", status: "closed" })])[0]).toMatchObject({ tone: "muted", late: null });
  expect(rows([issue({ startDate: "2026-09-10", dueDate: "2026-09-05" })])[0].bar).toEqual({ startCol: 9, span: 1 });
});

test("a dateless parent takes its children's span as a bracket; collapsing hides the children", () => {
  const family = [
    issue({ key: "26-0002", parentKey: "26-0001", startDate: "2026-09-03", dueDate: "2026-09-10" }),
    issue({ key: "26-0001" }),
    issue({ key: "26-0003", parentKey: "26-0001", startDate: "2026-09-08", dueDate: "2026-09-20" }),
  ];
  const r = rows(family);
  expect(r.map((x) => `${x.depth}:${x.key}`)).toEqual(["0:26-0001", "1:26-0002", "1:26-0003"]);
  expect(r[0]).toMatchObject({ kind: "bracket", bar: { startCol: 2, span: 18 }, hasChildren: true, collapsed: false });
  const c = rows(family, { collapsed: new Set(["26-0001"]) });
  expect(c.map((x) => x.key)).toEqual(["26-0001"]);
  expect(c[0].collapsed).toBe(true);
});

test("a grandchild's dates reach the root's bracket through a dateless child; collapsing the child hides the grandchild alone", () => {
  const family = [
    issue({ key: "26-0001" }),
    issue({ key: "26-0002", parentKey: "26-0001" }),
    issue({ key: "26-0003", parentKey: "26-0002", startDate: "2026-09-03", dueDate: "2026-09-10" }),
  ];
  const r = rows(family);
  expect(r.map((x) => `${x.depth}:${x.key}:${x.kind}`)).toEqual(["0:26-0001:bracket", "1:26-0002:bracket", "2:26-0003:bar"]);
  expect(r[0].bar).toEqual({ startCol: 2, span: 8 });
  expect(rows(family, { collapsed: new Set(["26-0002"]) }).map((x) => x.key)).toEqual(["26-0001", "26-0002"]);
});

test("grouping by assignee keeps children under their parent and puts 未設定 last", () => {
  const l = layoutGantt(
    [
      issue({ key: "26-0001", assignee: "bob", dueDate: "2026-09-30" }),
      issue({ key: "26-0002", parentKey: "26-0001", assignee: "amy", dueDate: "2026-09-15" }),
      issue({ key: "26-0003", assignee: "amy", dueDate: "2026-09-15" }),
      issue({ key: "26-0004", dueDate: "2026-09-15" }),
    ],
    range,
    { ...opts, groupBy: "assignee" },
  );
  expect(l.groups.map((g) => `${g.label}:${g.rows.map((r) => r.key).join(",")}`)).toEqual(["amy:26-0003", "bob:26-0001,26-0002", "null:26-0004"]);
});

test("groups are ordered by the display name, so a member with a stamp id sorts by name", () => {
  const l = layoutGantt(
    [issue({ key: "26-0001", assignee: "20260914T000000000Z", dueDate: "2026-09-30" }), issue({ key: "26-0002", assignee: "alice", dueDate: "2026-09-15" })],
    range,
    { ...opts, groupBy: "assignee", groupLabel: (u) => (u === "alice" ? "佐藤" : "田中") },
  );
  expect(l.groups.map((g) => g.label)).toEqual(["alice", "20260914T000000000Z"]);
});

test("compare orders the top-level rows; children still follow their parent in key order", () => {
  const dated = (key: string, dueDate: string, parentKey: string | null = null): Issue => issue({ key, dueDate, parentKey, startDate: "2026-09-01" });
  const all = [dated("26-0001", "2026-09-20"), dated("26-0002", "2026-09-05"), dated("26-0004", "2026-09-02", "26-0002"), dated("26-0003", "2026-09-01", "26-0002")];
  const byDue = (a: Issue, b: Issue): number => (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
  expect(rows(all, { compare: byDue }).map((r) => `${r.depth}:${r.key}`)).toEqual(["0:26-0002", "1:26-0003", "1:26-0004", "0:26-0001"]);
  expect(rows(all).map((r) => r.key)).toEqual(["26-0002", "26-0003", "26-0004", "26-0001"]);
});
