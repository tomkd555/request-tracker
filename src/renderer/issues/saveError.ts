/** Formats a save error for display; a stale-write rejection gets the shared Japanese message. */
export function staleMessage(e: unknown): string {
  if (e instanceof Error && e.message === "stale") return "他の人が先に保存しました。再読み込みしてください";
  return e instanceof Error ? e.message : String(e);
}
