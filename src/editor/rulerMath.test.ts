import { expect, it } from "vitest";
import {
  mmToRulerPx,
  niceRulerStep,
  rulerPxToMm,
  rulerTicks,
} from "./rulerMath";

it("R01 round-trips mm through ruler pixels under pan, zoom and negatives", () => {
  for (const view of [
    { x: 40, scale: 2 },
    { x: -325.5, scale: 0.5 },
    { x: 1200, scale: 10 },
  ]) {
    for (const mm of [-240.5, -10, 0, 2.5, 125]) {
      const px = mmToRulerPx(mm, view.x, view.scale);
      expect(rulerPxToMm(px, view.x, view.scale)).toBeCloseTo(mm, 10);
    }
  }
  expect(rulerPxToMm(0, 8, 0)).toBeNaN();
});

it("chooses 1/2/5 x 10^n steps and labels only visible ticks", () => {
  expect(niceRulerStep(2)).toBe(50);
  expect(niceRulerStep(10)).toBe(10);
  expect(niceRulerStep(0.5)).toBe(200);
  expect(niceRulerStep(0)).toBeNaN();
  const ticks = rulerTicks(100, 2, 400);
  expect(ticks.length).toBeGreaterThan(0);
  expect(ticks[0].px).toBeGreaterThanOrEqual(-1e-9);
  expect(ticks.at(-1)!.px).toBeLessThanOrEqual(400 + 1e-9);
  expect(ticks.some((tick) => tick.mm < 0)).toBe(true);
  expect(ticks.some((tick) => tick.major)).toBe(true);
  // Zooming out increases the physical step instead of exploding tick counts.
  const zoomedOut = rulerTicks(0, 0.02, 400);
  expect(zoomedOut.length).toBeLessThan(60);
  expect(zoomedOut.some((tick) => tick.major)).toBe(true);
  expect(rulerTicks(0, 2, 0)).toEqual([]);
});
