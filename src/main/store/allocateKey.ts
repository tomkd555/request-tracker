/** Next key for the two-digit fiscal year `yy` given every key already in use (issues and trash): "26-0001", "26-0002", … */
export function allocateKey(existingKeys: Iterable<string>, yy: string): string {
  let maxSequence = 0;
  const keyOfYear = new RegExp(`^${yy}-(\\d+)$`);
  for (const key of existingKeys) {
    const match = keyOfYear.exec(key);
    if (match) maxSequence = Math.max(maxSequence, Number(match[1]));
  }
  // ponytail: past 9999 the number simply grows to five digits
  return `${yy}-${String(maxSequence + 1).padStart(4, "0")}`;
}

/** Key part of a record file name: "26-0001.json" and trashed "26-0001.20260912T000000000Z.json" -> "26-0001". */
export function keyOfFileName(name: string): string | null {
  const match = /^(\d{2}-\d{4,})(?:\.[^.]+)?\.json$/.exec(name);
  return match ? match[1] : null;
}
