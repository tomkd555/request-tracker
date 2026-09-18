import { expect, test } from "vitest";
import { nextStep } from "../../../src/renderer/app/boot";
import { DEFAULT_STATUSES } from "../../../src/shared/types";

const project = { fiscalYearStartMonth: 4, createdAt: "2026-09-12T00:00:00.000Z", categories: [], categoryColors: {}, categoryTemplates: {}, fields: [], labels: [], statuses: DEFAULT_STATUSES };
const me = { username: "alice", displayName: "Alice", createdAt: "2026-09-12T00:00:00.000Z" };

test("first launch walks folder -> month -> name -> ready", () => {
  expect(nextStep(null, null, null)).toBe("folder");
  expect(nextStep({ rootDir: "X:/share" }, null, null)).toBe("month");
  expect(nextStep({ rootDir: "X:/share" }, project, null)).toBe("name");
  expect(nextStep({ rootDir: "X:/share" }, project, me)).toBe("ready");
});
