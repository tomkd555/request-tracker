const KEY = /^(\d+)-(\d+)$/;

/** Orders issue keys (`<fiscal year>-<number>`) by year, then by number, both numerically; text that is no key compares as text. */
export function compareKeys(a: string, b: string): number {
  const ma = KEY.exec(a);
  const mb = KEY.exec(b);
  if (ma === null || mb === null) return a < b ? -1 : a > b ? 1 : 0;
  return Number(ma[1]) - Number(mb[1]) || Number(ma[2]) - Number(mb[2]);
}
