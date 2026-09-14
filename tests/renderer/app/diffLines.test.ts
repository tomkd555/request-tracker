import { expect, test } from "vitest";
import { diffHunks, diffLines } from "../../../src/renderer/app/diffLines";

test("changed lines are marked and unchanged lines kept in order", () => {
  expect(diffLines("a\nb\nc", "a\nx\nc\nd")).toEqual([
    { kind: "same", text: "a" },
    { kind: "del", text: "b" },
    { kind: "add", text: "x" },
    { kind: "same", text: "c" },
    { kind: "add", text: "d" },
  ]);
});

test("identical texts give no hunks; a far change gets two lines of context and a gap marker", () => {
  expect(diffHunks(diffLines("a\nb", "a\nb"))).toEqual([]);
  const lines = diffLines("1\n2\n3\n4\n5\n6\n7\n8\n9", "1\n2\n3\n4\n5\n6\n7\n8\nX");
  expect(diffHunks(lines).map((l) => (l === null ? "…" : `${l.kind}:${l.text}`))).toEqual(["same:7", "same:8", "del:9", "add:X"]);
  const two = diffLines("A\n2\n3\n4\n5\n6\n7\nB", "a\n2\n3\n4\n5\n6\n7\nb");
  expect(diffHunks(two).filter((l) => l === null)).toHaveLength(1);
});
