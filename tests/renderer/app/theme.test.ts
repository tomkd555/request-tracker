import { expect, test } from "vitest";
import { luminance, textOn, THEMES } from "../../../src/renderer/app/theme";

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
