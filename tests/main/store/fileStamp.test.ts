import { expect, test } from "vitest";
import { fileStamp } from "../../../src/main/store/fileStamp";

test("formats an ISO timestamp as a UTC file stamp", () => {
  expect(fileStamp("2026-09-12T08:05:03.123+09:00")).toBe("20260911T230503123Z");
});

test("later timestamps sort after earlier ones as strings", () => {
  expect(fileStamp("2026-09-12T00:00:00Z") < fileStamp("2026-09-12T00:00:01Z")).toBe(true);
});

test("rejects an invalid date", () => {
  expect(() => fileStamp("yesterday")).toThrow();
});
