/** Next key for fiscal year `yy` given every key already in use (issues and trash): "26-0001", "26-0002", … */
export function allocateKey(existingKeys: Iterable<string>, yy: string): string {
  let max = 0;
  const re = new RegExp(`^${yy}-(\\d+)$`);
  for (const key of existingKeys) {
    const m = re.exec(key);
    if (m) max = Math.max(max, Number(m[1]));
  }
  // ponytail: past 9999 the number simply grows to five digits
  return `${yy}-${String(max + 1).padStart(4, "0")}`;
}

/** Key part of a record file name: "26-0001.json" and trashed "26-0001.20260912T000000000Z.json" -> "26-0001". */
export function keyOfFileName(name: string): string | null {
  const m = /^(\d{2}-\d{4,})(?:\.[^.]+)?\.json$/.exec(name);
  return m ? m[1] : null;
}
