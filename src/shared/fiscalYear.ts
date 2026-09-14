/** Full year of the fiscal year containing `date`, for a fiscal year that starts on the 1st of `startMonth` (1–12). */
export function fiscalYearOf(date: Date | string, startMonth: number): number {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) throw new Error(`fiscalYearOf: invalid date ${String(date)}`);
  const month = d.getMonth() + 1; // local time: the user's calendar decides the year
  return month >= startMonth ? d.getFullYear() : d.getFullYear() - 1;
}

/** Two-digit fiscal year used as the key prefix: 2026 -> "26". */
export const fiscalYy = (year: number): string => String(year % 100).padStart(2, "0");
