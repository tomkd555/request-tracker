// Day-only date helpers over YYYY-MM-DD strings, local time.
import { M } from "../messages";

export const pad = (n: number): string => String(n).padStart(2, "0");
export const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromYmd = (s: string): Date => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
export const addDays = (s: string, n: number): string => {
  const d = fromYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const dayDiff = (from: string, to: string): number => Math.round((fromYmd(to).getTime() - fromYmd(from).getTime()) / 86400000);
export const todayYmd = (): string => ymd(new Date());

/** The message refusing a save that leaves the due date before the start date; null when `patch` keeps the pair in order or changes no date. Dates already reversed on disk stay editable toward a valid pair. */
export function dateRefusal(issue: { startDate: string | null; dueDate: string | null }, patch: { startDate?: string | null; dueDate?: string | null }): string | null {
  if (patch.startDate === undefined && patch.dueDate === undefined) return null;
  const start = patch.startDate !== undefined ? patch.startDate : issue.startDate;
  const due = patch.dueDate !== undefined ? patch.dueDate : issue.dueDate;
  return start !== null && due !== null && due < start ? M.dueBeforeStart : null;
}
