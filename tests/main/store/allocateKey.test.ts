import { expect, test } from "vitest";
import { allocateKey, keyOfFileName } from "../../../src/main/store/allocateKey";

test("first key of a fiscal year", () => {
  expect(allocateKey([], "26")).toBe("26-0001");
  expect(allocateKey(["25-0350"], "26")).toBe("26-0001");
});

test("max + 1 within the same fiscal year, ignoring gaps", () => {
  expect(allocateKey(["26-0001", "26-0007", "26-0003"], "26")).toBe("26-0008");
});

test("grows past four digits", () => {
  expect(allocateKey(["26-9999"], "26")).toBe("26-10000");
});

test("key of a record or trash file name", () => {
  expect(keyOfFileName("26-0001.json")).toBe("26-0001");
  expect(keyOfFileName("26-0001.20260912T000000000Z.json")).toBe("26-0001");
  expect(keyOfFileName(".26-0001.json.tmp-123")).toBeNull();
  expect(keyOfFileName("notes.txt")).toBeNull();
});
