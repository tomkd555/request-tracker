import type { AddAttachmentsResult } from "../../shared/api";

const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

/** Turns the main process's error tokens into the messages shown in the attachments section. */
export function messageFor(error: unknown): string {
  const m = error instanceof Error ? error.message : String(error);
  if (m.includes("share-unreachable")) return "共有フォルダに接続できません";
  if (m.includes("open-failed")) return `開けません：${m.slice(m.indexOf("open-failed:") + 12).trim()}`;
  if (m.includes("refused-extension")) return "実行ファイルは開けません";
  return m;
}

/** One message per refusal reason, naming the files. */
export function refusalMessages(r: AddAttachmentsResult): string[] {
  const out: string[] = [];
  const size = r.refused.filter((x) => x.reason === "size").map((x) => fileName(x.path));
  const ext = r.refused.filter((x) => x.reason === "extension").map((x) => fileName(x.path));
  if (size.length) out.push(`50MBを超えるファイルは添付できません：${size.join("、")}`);
  if (ext.length) out.push(`実行ファイルは添付できません：${ext.join("、")}`);
  const links = r.refused.filter((x) => x.reason === "link").map((x) => fileName(x.path));
  if (links.length) out.push(`リンクは添付できません：${links.join("、")}`);
  return out;
}
