import { expect, test } from "vitest";
import { resolveParent } from "../../../src/renderer/issues/ParentField";
import type { Issue } from "../../../src/shared/types";

const issue = (key: string): Issue => ({
  key,
  summary: "件名",
  description: "",
  category: "",
  status: "open",
  priority: "normal",
  assignee: null,
  reporter: "a",
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

test("empty text is no parent; a known key, alone or with the summary, resolves; anything else is invalid", () => {
  const c = [issue("26-0001")];
  expect(resolveParent("  ", c)).toEqual({ key: null, invalid: false });
  expect(resolveParent("26-0001", c)).toEqual({ key: "26-0001", invalid: false });
  expect(resolveParent("26-0001 件名", c)).toEqual({ key: "26-0001", invalid: false });
  expect(resolveParent("26-0009", c)).toEqual({ key: null, invalid: true });
});
