import { expect, test } from "vitest";
import { parseHash } from "../../../src/renderer/app/useHashRoute";

test("an empty hash is the issue list", () => {
  expect(parseHash("").path).toBe("/issues");
});

test("a missing leading slash is added", () => {
  expect(parseHash("#issues").path).toBe("/issues");
});

test("the query string is split off", () => {
  const r = parseHash("#/issues/new?parent=26-0001");
  expect(r.path).toBe("/issues/new");
  expect(r.query.get("parent")).toBe("26-0001");
});
