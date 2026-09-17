/** Formats a save error for display; a stale-write rejection gets the shared Japanese message. */
export function staleMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  // Across the IPC boundary the store's "stale" arrives as "Error invoking remote method 'issues:put': Error: stale".
  return m === "stale" || m.endsWith(": stale") ? "他の人が先に保存しました。再読み込みしてください" : m;
}
