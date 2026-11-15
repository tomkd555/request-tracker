import { isYmd, type Milestone } from "../../shared/types";
import { addDays } from "../issues/dates";

const MAX_OCTETS = 75; // RFC 5545 section 3.1, CRLF excluded
const encoder = new TextEncoder();

/** RFC 5545 section 3.3.11: backslash, semicolon, comma and line breaks in a TEXT value. */
const escapeText = (s: string): string => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");

/** Splits a line after at most 75 octets, each continuation starting with one space, never inside a character. */
function fold(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let used = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (used + size > MAX_OCTETS) {
      out.push(cur);
      cur = " ";
      used = 1;
    }
    cur += ch;
    used += size;
  }
  out.push(cur);
  return out;
}

const compact = (ymd: string): string => ymd.replace(/-/g, "");

/** An iCalendar file with one all-day event per milestone that has a due date; lines end in CRLF. */
export function milestonesToIcs(milestones: Milestone[], now: Date): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Request Tracker//JA"];
  for (const m of milestones) {
    if (!isYmd(m.dueDate)) continue; // null, or a value from a hand-edited project.json that must not reach a property line
    lines.push(
      "BEGIN:VEVENT",
      `UID:${m.id.replace(/[^A-Za-z0-9-]/g, "_")}@request-tracker`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(m.dueDate)}`,
      `DTEND;VALUE=DATE:${compact(addDays(m.dueDate, 1))}`,
      `SUMMARY:${escapeText(m.name)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.flatMap(fold).map((l) => `${l}\r\n`).join("");
}
