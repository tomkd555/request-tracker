import type { BurndownRow } from "./burndown";

export type BurndownMeasure = "open" | "hours";

export interface ChartPoint { day: string; value: number; x: number; y: number }
export interface ChartGeometry {
  plot: { left: number; right: number; bottom: number };
  measured: ChartPoint[];
  ideal: { x1: number; y1: number; x2: number; y2: number } | null;
  xTicks: { x: number; label: string }[];
  yTicks: { y: number; label: string }[];
}

const MARGIN = { left: 48, right: 16, top: 16, bottom: 32 };
const LABEL_SLOT = 64; // px per x label
const MAX_INTERVALS = 5;
const round = (n: number): number => Math.round(n * 1e6) / 1e6;

/** The smallest 1, 2 or 5 times a power of ten that cuts `max` into at most 5 intervals; counts step by whole numbers. */
function niceStep(max: number, integer: boolean): number {
  if (max <= 0) return 1;
  for (let exp = integer ? 0 : -2; ; exp++) {
    for (const m of [1, 2, 5]) {
      const step = round(m * 10 ** exp);
      if (max / step <= MAX_INTERVALS + 1e-9) return step;
    }
  }
}

/** Points and ticks of the burndown line chart in a `width` x `height` box: the measured line to today, the ideal line from the largest measured value down to 0 on the due day, labelled axes. */
export function chartGeometry(
  rows: BurndownRow[],
  measure: BurndownMeasure,
  opts: { width: number; height: number; today: string; dueDay: string | null },
): ChartGeometry {
  const plotW = opts.width - MARGIN.left - MARGIN.right;
  const plotH = opts.height - MARGIN.top - MARGIN.bottom;
  const bottom = opts.height - MARGIN.bottom;
  const n = rows.length;
  const values = rows.map((r) => r[measure]);
  const step = niceStep(Math.max(0, ...values), measure === "open");
  const top = Math.max(step, Math.ceil(round(Math.max(0, ...values) / step)) * step);
  const x = (i: number): number => (n === 1 ? MARGIN.left + plotW / 2 : MARGIN.left + (i * plotW) / (n - 1));
  const y = (v: number): number => bottom - (v / top) * plotH;

  const measured = rows.flatMap((r, i) => (r.day <= opts.today ? [{ day: r.day, value: r[measure], x: x(i), y: y(r[measure]) }] : []));
  const dueIndex = opts.dueDay === null ? -1 : rows.findIndex((r) => r.day === opts.dueDay);
  // From the largest value measured so far: issues often join a milestone after its first day, and a line from 0 would say nothing.
  const ideal = dueIndex < 0 ? null : { x1: x(0), y1: y(Math.max(0, ...measured.map((p) => p.value))), x2: x(dueIndex), y2: y(0) };

  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / LABEL_SLOT))));
  const xTicks = rows.flatMap((r, i) => (i % every === 0 ? [{ x: x(i), label: `${Number(r.day.slice(5, 7))}/${Number(r.day.slice(8, 10))}` }] : []));
  const yTicks = Array.from({ length: Math.round(top / step) + 1 }, (_, k) => ({ y: y(round(k * step)), label: String(round(k * step)) }));
  return { plot: { left: MARGIN.left, right: MARGIN.left + plotW, bottom }, measured, ideal, xTicks, yTicks };
}
