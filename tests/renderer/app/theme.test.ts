import { expect, test } from "vitest";
import { luminance, nextColor, PALETTE, textOn, THEMES } from "../../../src/renderer/app/theme";
import { HEX_COLOR } from "../../../src/shared/types";

test("PALETTE holds eight distinct #rrggbb presets that keep white text at 3:1", () => {
  expect(PALETTE).toHaveLength(8);
  expect(new Set(PALETTE.map((p) => p.hex)).size).toBe(8);
  for (const p of PALETTE) {
    expect(p.hex).toMatch(HEX_COLOR);
    expect(textOn(p.hex)).toBe("#ffffff");
  }
});

test("nextColor skips presets already in use and cycles once every preset is taken", () => {
  expect(nextColor([])).toBe(PALETTE[0].hex);
  expect(nextColor([PALETTE[0].hex, null, PALETTE[1].hex.toUpperCase()])).toBe(PALETTE[2].hex);
  const all = PALETTE.map((p) => p.hex);
  expect(nextColor(all)).toBe(PALETTE[0].hex);
  expect(nextColor([...all, "#123456"])).toBe(PALETTE[1].hex);
});

test("textOn keeps white on the presets and switches to dark text on light colours", () => {
  expect(textOn("#52987c")).toBe("#ffffff");
  expect(textOn("#3d6fb4")).toBe("#ffffff");
  expect(textOn("#a4ae49")).toBe("#242424");
  expect(textOn("#ffd700")).toBe("#242424");
  for (const t of Object.values(THEMES)) expect(textOn(t.accent)).toBe("#ffffff");
});

test("luminance matches the WCAG definition at the ends of the scale", () => {
  expect(luminance("#000000")).toBe(0);
  expect(luminance("#ffffff")).toBeCloseTo(1, 5);
  expect(luminance("#52987c")).toBeCloseTo(0.257, 2);
});
