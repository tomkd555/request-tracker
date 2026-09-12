import { expect, test } from "vitest";
import { linkedTitles, linkWikiPages } from "../../../src/renderer/app/wikiLinks";

const resolve = (t: string): string | null => (t === "運用手順" ? "20260901T000000000Z" : null);

test("a known title links to the page; a label replaces the text", () => {
  expect(linkWikiPages("see [[運用手順]] and [[ 運用手順 | 手順 ]]", resolve)).toBe(
    "see [運用手順](#/wiki/20260901T000000000Z) and [手順](#/wiki/20260901T000000000Z)",
  );
});

test("a missing title opens the new-page form with the title and parent", () => {
  expect(linkWikiPages("[[新しい]]", resolve, "p1")).toBe("[新しい](#/wiki/new?title=%E6%96%B0%E3%81%97%E3%81%84&parent=p1)");
  expect(linkWikiPages("[[新しい]]", resolve)).toBe("[新しい](#/wiki/new?title=%E6%96%B0%E3%81%97%E3%81%84)");
});

test("links inside code stay as text; linkedTitles lists distinct titles", () => {
  expect(linkWikiPages("`[[運用手順]]`", resolve)).toBe("`[[運用手順]]`");
  expect(linkedTitles("[[a]] [[b|x]] [[a]] `[[c]]`")).toEqual(["a", "b"]);
});
