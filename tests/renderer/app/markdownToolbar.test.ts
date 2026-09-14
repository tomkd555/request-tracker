import { expect, test } from "vitest";
import { applyCommand } from "../../../src/renderer/app/markdownToolbar";

test("line commands prefix every selected line and select the block", () => {
  const r = applyCommand("ol", { text: "a\nb\nc", start: 2, end: 3 });
  expect(r).toEqual({ text: "a\n1. b\nc", start: 2, end: 6 });
  expect(applyCommand("check", { text: "x\ny", start: 0, end: 3 }).text).toBe("- [ ] x\n- [ ] y");
});

test("bold wraps the selection, or inserts and selects a placeholder", () => {
  expect(applyCommand("bold", { text: "ab", start: 0, end: 2 })).toEqual({ text: "**ab**", start: 2, end: 4 });
  expect(applyCommand("bold", { text: "", start: 0, end: 0 })).toEqual({ text: "**太字**", start: 2, end: 4 });
});

test("code is inline for one line and fenced across lines", () => {
  expect(applyCommand("code", { text: "x", start: 0, end: 1 }).text).toBe("`x`");
  expect(applyCommand("code", { text: "a\nb", start: 0, end: 3 }).text).toBe("```\na\nb\n```");
});

test("the issue-key command inserts the prefix it is given", () => {
  expect(applyCommand("issueKey", { text: "see ", start: 4, end: 4 }, "27-")).toEqual({ text: "see 27-", start: 7, end: 7 });
});

test("link selects the url placeholder; table lands on its own line", () => {
  expect(applyCommand("link", { text: "see", start: 0, end: 3 })).toEqual({ text: "[see](url)", start: 6, end: 9 });
  const t = applyCommand("table", { text: "p", start: 1, end: 1 });
  expect(t.text.startsWith("p\n| 項目 |")).toBe(true);
  expect(t.start).toBe(t.text.length);
});
