import type { AddAttachmentsResult, AttachmentRefusal } from "../shared/api";
import { MAX_DEPTH } from "../shared/issueTree";
import type { SettingsPart } from "./app/projectSettingsFile";
import type { CellProblem } from "./issues/importPlan";

/** The shared folder as a message names it: with its path once one is chosen. */
const shareName = (rootDir: string | null): string => (rootDir === null ? "共有フォルダ" : `共有フォルダ（${rootDir}）`);

/**
 * Every message the screens show — errors, confirmations, status, validation, empty states — by ID.
 * Captions of buttons, headings and columns stay in the components that own them.
 */
export const M = {
  saved: "保存しました",
  csvSaved: "CSVを保存しました",
  htmlSaved: "HTMLを保存しました",
  settingsExported: "設定を保存しました",
  settingsImported: "設定をインポートしました",
  settingsFileInvalid: (part: SettingsPart): string => `設定ファイルの${part}を読めません`,
  confirmReplaceSettings: "現在のプロジェクト設定を置き換えますか",
  icsSaved: "ICSを保存しました",
  icsNoDueDate: "期限日のあるマイルストーンがありません",
  noBurndownIssues: "このマイルストーンの課題はありません",
  burndownNoDays: "開始日が終了日（期限日、なければ今日）より後のため、表示できる日がありません",
  markdownSaved: "Markdownを保存しました",
  copied: "クリップボードにコピーしました",
  issueAdded: (key: string): string => `${key} を追加しました`,
  bulkUpdated: (n: number): string => `${n}件を更新しました`,
  bulkOverCap: (max: number): string => `一度に更新できるのは${max}件までです`,

  confirmDiscard: "編集内容を破棄しますか",
  confirmDelete: (name: string): string => `${name} を削除しますか`,
  confirmRemoveMember: (name: string): string => `${name} をメンバーから削除しますか`,
  confirmOverwrite: (name: string): string => `「${name}」を上書きしますか`,
  renameOnIssuesFailed: (keys: string[]): string => `設定は保存しました。次の課題は名前を変更できませんでした：${keys.join("、")}`,
  confirmRenameOnIssues: (lines: string[]): string => `${lines.join("\n")}\n課題の名前も変更しますか（キャンセルすると設定だけを保存します）`,

  summaryRequired: "件名を入力してください",
  titleRequired: "タイトルを入力してください",
  dueBeforeStart: "期限日は開始日以降にしてください",
  hoursInvalid: "時間は0以上の数で、小数点以下は2桁までです",
  parentNotFound: "該当する課題がありません",
  importNoSummaryColumn: "件名の列がありません",
  importNoRows: "登録する行がありません",
  importTooMany: (max: number): string => `${max}行を超えるファイルは登録できません`,
  importCreated: (n: number): string => `${n}件を登録しました`,
  importGuide: (max: number): string => `1行目に列名を書いたCSVを選んでください。件名の列が必要です。列名は「CSVに出力」のファイルと同じで、1ファイルにつき${max}行まで登録できます`,
  importRetry: "登録済みの行をCSVから削除して、もう一度選んでください",
  importFailedAt: (row: number, detail: string): string => `${row}行目を登録できませんでした：${detail}`,
  importError: (e: CellProblem): string => {
    switch (e.code) {
      case "summary": return "件名がありません";
      case "date": return `${e.column}の形式が違います：${e.value}`;
      case "dateOrder": return M.dueBeforeStart;
      case "hours": return `${e.column}：${M.hoursInvalid}（${e.value}）`;
      case "parent": return `親課題が見つかりません：${e.value}`;
      case "depth": return `親課題の階層が${MAX_DEPTH}段を超えます：${e.value}`;
      default: return `${e.column}に「${e.value}」はありません`;
    }
  },
  parentKept: "親課題は戻せないため、現在の親課題のままにしました",
  duplicateTitle: "同じタイトルのページが既にあります",
  keywordPrompt: "キーワードを入力してください",
  selectPrompt: "選択してください",
  folderPrompt: "全員が読み書きできる共有フォルダを選んでください",
  folderEmpty: "このフォルダにはまだプロジェクトがありません",

  noIssues: "該当する課題はありません",
  noHits: "該当はありません",
  noNotices: "お知らせはありません",
  noRecent: "最近の更新はありません",
  noPagesMatch: "該当するページはありません",
  noPages: "ページはありません",
  noHistory: "履歴はありません",
  noReports: "レポートはありません",
  blockInvalid: (line: number): string => `${line}行目のブロックの設定を読めません`,
  noAttachments: "添付ファイルはありません",
  noComments: "コメントはありません",
  noChildIssues: "子課題はありません",
  openDescendants: (n: number): string => `配下に未完了の課題が${n}件あります`,
  datedDescendants: (n: number): string => `配下の課題${n}件に日付があります`,
  noBodyChange: "本文に変更はありません",

  issueHasChildren: "子課題があるため削除できません",
  pageHasChildren: "子ページがあるため削除できません",
  shareUnreadable: (detail: string): string => `共有フォルダを読めません（${detail}）。ネットワークドライブやVPNを確認してください`,
  shareUnreachableAt: (rootDir: string | null): string => `${shareName(rootDir)}に接続できません。ネットワークドライブやVPNを確認してください`,
  projectInvalidAt: (rootDir: string | null): string => `${shareName(rootDir)}のproject.jsonを読めません`,
  openFailed: (detail: string): string => `開けません：${detail}`,

  attachTooLarge: (names: string[]): string => `50MBを超えるファイルは添付できません：${names.join("、")}`,
  attachLink: (names: string[]): string => `リンクは添付できません：${names.join("、")}`,
  attachFailed: (names: string[]): string => `添付できませんでした：${names.join("、")}`,
  attachDotName: (names: string[]): string => `名前が「.」で始まるファイルやフォルダは添付できません：${names.join("、")}`,
} as const;

/** Main-process rejection codes and the message each one shows. */
const ERROR_BY_CODE: Record<string, string> = {
  stale: "他の人が先に保存しました。再読み込みしてください",
  cycle: "この課題の下の課題は親課題に選べません",
  "too-deep": `課題は${MAX_DEPTH}階層までです`,
  "has-children": M.issueHasChildren,
  "in-use": "このメンバーが担当者か登録者になっている課題があるため削除できません",
  "already-claimed": "別の端末がこの名前を使っています",
  "share-unreachable": "共有フォルダに接続できません",
};
/** The wiki names pages where issues name issues. */
const WIKI_ERROR_BY_CODE: Record<string, string> = { ...ERROR_BY_CODE, cycle: "このページの下のページは親ページに選べません", "has-children": M.pageHasChildren };

const OPEN_FAILED = "open-failed:";

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// Across the IPC boundary "stale" arrives as "Error invoking remote method 'issues:put': Error: stale".
const hasCode = (message: string, code: string): boolean => message === code || message.endsWith(`: ${code}`);

/** True when a rejection from the main process carries `code`, direct or wrapped by IPC. */
export const hasErrorCode = (e: unknown, code: string): boolean => hasCode(messageOf(e), code);

/** Turns a rejection from the main process into the message shown; text carrying no known code passes through. */
export function errorMessage(e: unknown, scope: "issue" | "wiki" = "issue"): string {
  const message = messageOf(e);
  const table = scope === "wiki" ? WIKI_ERROR_BY_CODE : ERROR_BY_CODE;
  const code = Object.keys(table).find((c) => hasCode(message, c));
  if (code !== undefined) return table[code];
  if (message.includes(OPEN_FAILED)) return M.openFailed(message.slice(message.indexOf(OPEN_FAILED) + OPEN_FAILED.length).trim());
  return message;
}

/** True for the stale-write rejection, direct or wrapped by IPC as in errorMessage. */
export function isStale(e: unknown): boolean {
  return hasErrorCode(e, "stale");
}

export const fileName = (path: string): string => path.split(/[\\/]/).pop() || path; // a drive root ends in a separator: show the path itself

/** The refusal reasons in the order their messages show, each with its message. */
const REFUSAL_MESSAGES: [AttachmentRefusal["reason"], (names: string[]) => string][] = [
  ["size", M.attachTooLarge],
  ["link", M.attachLink],
  ["name", M.attachDotName],
  ["failed", M.attachFailed],
];

/** One message per refusal reason, naming the files. */
export function refusalMessages(r: AddAttachmentsResult): string[] {
  return REFUSAL_MESSAGES.flatMap(([reason, messageFor]) => {
    const names = r.refused.filter((x) => x.reason === reason).map((x) => fileName(x.path));
    return names.length > 0 ? [messageFor(names)] : [];
  });
}
