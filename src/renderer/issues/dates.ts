// Day-only date helpers over YYYY-MM-DD strings, local time. Shared by the list, filters and gantt.

const pad = (n: number): string => String(n).padStart(2, "0");
export const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromYmd = (s: string): Date => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
export const addDays = (s: string, n: number): string => {
  const d = fromYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const dayDiff = (a: string, b: string): number => Math.round((fromYmd(b).getTime() - fromYmd(a).getTime()) / 86400000);
export const today = (): string => ymd(new Date());
