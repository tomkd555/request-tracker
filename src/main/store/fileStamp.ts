// "2026-09-12T08:05:03.123+09:00" -> "20260911T230503123Z" (UTC), sorts chronologically as a file name.
export function fileStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`fileStamp: invalid date ${iso}`);
  return d.toISOString().replace(/[-:.]/g, "");
}
