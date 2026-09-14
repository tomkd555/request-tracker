import { expect, test } from "vitest";
import { fiscalYearOf, fiscalYy } from "../../../src/shared/fiscalYear";

test("a date after the start month belongs to the current year", () => {
  expect(fiscalYearOf(new Date(2026, 8, 12), 4)).toBe(2026);
});

test("a date before the start month belongs to the previous year", () => {
  expect(fiscalYearOf(new Date(2027, 2, 15), 4)).toBe(2026);
});

test("start month 1 is the calendar year", () => {
  expect(fiscalYearOf(new Date(2027, 0, 1), 1)).toBe(2027);
  expect(fiscalYearOf(new Date(2026, 11, 31), 1)).toBe(2026);
});

test("two-digit prefix", () => {
  expect(fiscalYy(2026)).toBe("26");
  expect(fiscalYy(2105)).toBe("05");
});
