import { expect, test } from "vitest";
import { PALETTE } from "../../../src/renderer/app/theme";
import { categoryColor, LABEL_DEFAULT, labelColor, labelOptions, statusOf, toggleLabel, withKnownStatus } from "../../../src/renderer/issues/labels";
import { DEFAULT_STATUSES, type Issue, type Project } from "../../../src/shared/types";

const project = (labels: { name: string; color: string }[]): Project => ({
  fiscalYearStartMonth: 4,
  createdAt: "",
  categories: [],
  categoryColors: {},
  categoryTemplates: {},
  fields: [],
  labels,
  statuses: DEFAULT_STATUSES,
});

test("labelColor reads the project's colour, and falls back to grey once the label is gone", () => {
  const p = project([{ name: "bug", color: "#ff0000" }]);
  expect(labelColor(p, "bug")).toBe("#ff0000");
  expect(labelColor(p, "urgent")).toBe(LABEL_DEFAULT);
});

test("categoryColor reads the saved colour, falls back to the preset at the 種別's position, and grey once the 種別 is gone", () => {
  const p = { ...project([]), categories: ["調査", "改修", "問合せ"], categoryColors: { 改修: "#112233" } };
  expect(categoryColor(p, "改修")).toBe("#112233");
  expect(categoryColor(p, "調査")).toBe(PALETTE[0].hex);
  expect(categoryColor(p, "問合せ")).toBe(PALETTE[2].hex);
  expect(categoryColor(p, "廃止")).toBe(LABEL_DEFAULT);
});

test("toggleLabel adds an absent name and removes a present one", () => {
  expect(toggleLabel(["a"], "b")).toEqual(["a", "b"]);
  expect(toggleLabel(["a", "b"], "a")).toEqual(["b"]);
});

test("labelOptions lists the project's names plus any current name that is no longer among them", () => {
  const p = project([{ name: "bug", color: "#ff0000" }, { name: "urgent", color: "#00ff00" }]);
  expect(labelOptions(p, [])).toEqual(["bug", "urgent"]);
  expect(labelOptions(p, ["bug", "old"])).toEqual(["bug", "urgent", "old"]);
});

test("statusOf reads the stage by id and falls back to the first stage once the id is gone", () => {
  expect(statusOf(DEFAULT_STATUSES, "closed").name).toBe("完了");
  expect(statusOf(DEFAULT_STATUSES, "gone")).toBe(DEFAULT_STATUSES[0]);
});

test("withKnownStatus rewrites only the issues whose stage left the list and keeps the other objects as they are", () => {
  const issue = (status: string): Issue => ({
    key: "26-0001",
    summary: "",
    description: "",
    category: "",
    status,
    priority: "normal",
    assignee: null,
    reporter: "alice",
    parentKey: null,
    startDate: null,
    dueDate: null,
    createdAt: "",
    updatedAt: "",
    updatedBy: "",
    fields: {},
    labels: [],
    relations: [],
  });
  const kept = issue("closed");
  const [a, b] = withKnownStatus([kept, issue("gone")], DEFAULT_STATUSES);
  expect(a).toBe(kept);
  expect(b.status).toBe("open");
});
