import { MAX_DEPTH } from "../../shared/issueTree";

// Across the IPC boundary the store's "stale" arrives as "Error invoking remote method 'issues:put': Error: stale".
const is = (m: string, code: string): boolean => m === code || m.endsWith(`: ${code}`);

/** Formats a save error for display; a stale-write or parent rejection gets the shared Japanese message. */
export function staleMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (is(m, "stale")) return "他の人が先に保存しました。再読み込みしてください";
  if (is(m, "cycle")) return "この課題の下の課題は親課題に選べません";
  if (is(m, "too-deep")) return `課題は${MAX_DEPTH}階層までです`;
  return m;
}
