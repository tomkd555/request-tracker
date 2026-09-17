import { expect, test } from "vitest";
import { staleMessage } from "../../../src/renderer/issues/saveError";

test("a stale rejection reads the same whether it comes straight from the store or through IPC", () => {
  const expected = "他の人が先に保存しました。再読み込みしてください";
  expect(staleMessage(new Error("stale"))).toBe(expected);
  expect(staleMessage(new Error("Error invoking remote method 'issues:put': Error: stale"))).toBe(expected);
  expect(staleMessage(new Error("cycle"))).toBe("cycle");
  expect(staleMessage("x")).toBe("x");
});
