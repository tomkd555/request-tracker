import { expect, test } from "vitest";
import { messageFor, refusalMessages } from "../../../src/renderer/issues/attachmentMessages";

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

test("store error tokens map to the user messages", () => {
  expect(messageFor(new Error("Error invoking remote method 'attachments:add': Error: share-unreachable"))).toBe("共有フォルダに接続できません");
  expect(messageFor(new Error("open-failed: Failed to open path"))).toBe("開けません：Failed to open path");
});
