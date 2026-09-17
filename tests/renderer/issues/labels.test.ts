import { expect, test } from "vitest";
import { LABEL_DEFAULT, labelColor, labelOptions, toggleLabel } from "../../../src/renderer/issues/labels";
import type { Project } from "../../../src/shared/types";

const project = (labels: { name: string; color: string }[]): Project => ({
  fiscalYearStartMonth: 4,
  createdAt: "",
  categories: [],
  categoryColors: {},
  categoryTemplates: {},
  fields: [],
  labels,
});

test("labelColor reads the project's colour, and falls back to grey once the label is gone", () => {
  const p = project([{ name: "bug", color: "#ff0000" }]);
  expect(labelColor(p, "bug")).toBe("#ff0000");
  expect(labelColor(p, "urgent")).toBe(LABEL_DEFAULT);
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
