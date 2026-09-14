import { expect, test } from "vitest";
import { linkIssueKeys, mentionedKeys } from "../../../src/renderer/app/linkIssueKeys";

test("a bare key becomes a hash link", () => {
  expect(linkIssueKeys("see 26-0012 and 26-0013.")).toBe("see [26-0012](#/issues/26-0012) and [26-0013](#/issues/26-0013).");
});

test("keys inside inline code and fenced blocks stay as text", () => {
  expect(linkIssueKeys("run `26-0012` now")).toBe("run `26-0012` now");
  expect(linkIssueKeys("```\n26-0012\n```\n26-0013")).toBe("```\n26-0012\n```\n[26-0013](#/issues/26-0013)");
});

test("an existing link and longer numbers are left alone", () => {
  expect(linkIssueKeys("[26-0012](#/issues/26-0012)")).toBe("[26-0012](#/issues/26-0012)");
  expect(linkIssueKeys("tel 026-0012-345")).toBe("tel 026-0012-345");
  expect(linkIssueKeys("https://intra/docs/26-0012")).toBe("https://intra/docs/26-0012");
});

test("mentionedKeys lists distinct keys outside code", () => {
  expect(mentionedKeys("26-0012, `26-0099`, 26-0012 and 26-0001")).toEqual(["26-0012", "26-0001"]);
});
