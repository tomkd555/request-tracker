import type { AddAttachmentsResult } from "../shared/api";
import { MAX_DEPTH } from "../shared/issueTree";

/**
 * Every message the screens show — errors, confirmations, status, validation, empty states — by ID.
 * Captions of buttons, headings and columns stay in the components that own them.
 */
export const M = {
  saved: "保存しました",
  csvSaved: "CSVを保存しました",
  htmlSaved: "HTMLを保存しました",
  markdownSaved: "Markdownを保存しました",
  copied: "クリップボードにコピーしました",
  issueAdded: (key: string): string => `${key} を追加しました`,
  bulkUpdated: (n: number): string => `${n}件を更新しました`,
  bulkOverCap: (max: number): string => `一度に更新できるのは${max}件までです`,

  confirmDiscard: "編集内容を破棄しますか",
  confirmDelete: (name: string): string => `${name} を削除しますか`,
  confirmRemoveMember: (name: string): string => `${name} をメンバーから削除しますか`,
  confirmOverwrite: (name: string): string => `「${name}」を上書きしますか`,

  summaryRequired: "件名を入力してください",
  titleRequired: "タイトルを入力してください",
  dueBeforeStart: "期限日は開始日以降にしてください",
  parentNotFound: "該当する課題がありません",
  duplicateTitle: "同じ親ページの下に同名のページがあります",
  keywordPrompt: "キーワードを入力してください",
  selectPrompt: "選択してください",
  folderPrompt: "全員が読み書きできる共有フォルダを選んでください",
  folderEmpty: "このフォルダにはまだプロジェクトがありません",

  noIssues: "該当する課題はありません",
  noHits: "該当はありません",
  noPagesMatch: "該当するページはありません",
  noPages: "ページはありません",
  noHistory: "履歴はありません",
  noReports: "レポートはありません",
  blockInvalid: (line: number): string => `${line}行目のブロックの設定を読めません`,
  noAttachments: "添付ファイルはありません",
  noComments: "コメントはありません",
  noChildIssues: "子課題はありません",
  noBodyChange: "本文に変更はありません",

  issueHasChildren: "子課題があるため削除できません",
  pageHasChildren: "子ページがあるため削除できません",
  shareUnreadable: (detail: string): string => `共有フォルダを読めません（${detail}）。ネットワークドライブやVPNを確認してください`,
  shareUnreachableAt: (where: string): string => `${where}に接続できません。ネットワークドライブやVPNを確認してください`,
  projectInvalidAt: (where: string): string => `${where}のproject.jsonを読めません`,

  attachTooLarge: (names: string[]): string => `50MBを超えるファイルは添付できません：${names.join("、")}`,
  attachExecutable: (names: string[]): string => `実行ファイルは添付できません：${names.join("、")}`,
  attachLink: (names: string[]): string => `リンクは添付できません：${names.join("、")}`,
} as const;

/** Main-process rejection codes and the message each one shows. */
const ERROR: Record<string, string> = {
  stale: "他の人が先に保存しました。再読み込みしてください",
  cycle: "この課題の下の課題は親課題に選べません",
  "too-deep": `課題は${MAX_DEPTH}階層までです`,
  "has-children": M.issueHasChildren,
  "in-use": "このメンバーが担当者か登録者になっている課題があるため削除できません",
  "already-claimed": "別の端末がこの名前を使っています",
  "share-unreachable": "共有フォルダに接続できません",
  "refused-extension": "実行ファイルは開けません",
};
/** The wiki names pages where issues name issues. */
const WIKI_ERROR: Record<string, string> = { ...ERROR, cycle: "このページの下のページは親ページに選べません", "has-children": M.pageHasChildren };

/** Turns a rejection from the main process into the message shown; text carrying no known code passes through. */
export function errorMessage(e: unknown, scope: "issue" | "wiki" = "issue"): string {
  const m = e instanceof Error ? e.message : String(e);
  // Across the IPC boundary "stale" arrives as "Error invoking remote method 'issues:put': Error: stale".
  const table = scope === "wiki" ? WIKI_ERROR : ERROR;
  const code = Object.keys(table).find((c) => m === c || m.endsWith(`: ${c}`));
  if (code !== undefined) return table[code];
  if (m.includes("open-failed:")) return `開けません：${m.slice(m.indexOf("open-failed:") + 12).trim()}`;
  return m;
}

const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

/** One message per refusal reason, naming the files. */
export function refusalMessages(r: AddAttachmentsResult): string[] {
  const names = (reason: string): string[] => r.refused.filter((x) => x.reason === reason).map((x) => fileName(x.path));
  const out: string[] = [];
  const size = names("size");
  const ext = names("extension");
  const links = names("link");
  if (size.length) out.push(M.attachTooLarge(size));
  if (ext.length) out.push(M.attachExecutable(ext));
  if (links.length) out.push(M.attachLink(links));
  return out;
}
