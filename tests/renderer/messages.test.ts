import { expect, test } from "vitest";
import { errorMessage, refusalMessages } from "../../src/renderer/messages";

test("a rejection reads the same whether it comes straight from the store or through IPC", () => {
  const expected = "他の人が先に保存しました。再読み込みしてください";
  expect(errorMessage(new Error("stale"))).toBe(expected);
  expect(errorMessage(new Error("Error invoking remote method 'issues:put': Error: stale"))).toBe(expected);
  expect(errorMessage(new Error("Error invoking remote method 'issues:put': Error: cycle"))).toBe("この課題の下の課題は親課題に選べません");
  expect(errorMessage(new Error("too-deep"))).toBe("課題は5階層までです");
  expect(errorMessage(new Error("Error invoking remote method 'attachments:add': Error: share-unreachable"))).toBe("共有フォルダに接続できません");
  expect(errorMessage(new Error("open-failed: Failed to open path"))).toBe("開けません：Failed to open path");
  expect(errorMessage("x")).toBe("x");
});

test("the wiki scope names pages where the issue scope names issues", () => {
  expect(errorMessage(new Error("cycle"), "wiki")).toBe("このページの下のページは親ページに選べません");
  expect(errorMessage(new Error("has-children"), "wiki")).toBe("子ページがあるため削除できません");
  expect(errorMessage(new Error("has-children"))).toBe("子課題があるため削除できません");
  expect(errorMessage(new Error("stale"), "wiki")).toBe(errorMessage(new Error("stale")));
});

test("refusals become one message per reason naming the files", () => {
  expect(
    refusalMessages({
      added: ["a.txt"],
      refused: [
        { path: "C:\\x\\big.bin", reason: "size" },
        { path: "C:/x/docs/sub/run.bat", reason: "extension" },
        { path: "C:/x/setup.exe", reason: "extension" },
      ],
    }),
  ).toEqual(["50MBを超えるファイルは添付できません：big.bin", "実行ファイルは添付できません：run.bat、setup.exe"]);
  expect(refusalMessages({ added: [], refused: [] })).toEqual([]);
});
