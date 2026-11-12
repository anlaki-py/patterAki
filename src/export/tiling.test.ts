import { describe, expect, it } from "vitest";
import { defaultPdfLayout, planPdfTiles, tileRegistration } from "./tiling";
const bounds = { min: { x: -5, y: -5 }, max: { x: 185, y: 245 } };
describe("physical PDF tiling", () => {
  it("tiles the M3 wallet cut at 1:1 with separate paper, content, margins and overlap", () => {
    const plan = planPdfTiles(bounds, defaultPdfLayout);
    expect([
      plan.paperWidth,
      plan.paperHeight,
      plan.columns,
      plan.rows,
    ]).toEqual([210, 297, 2, 1]);
    expect(
      plan.tiles.map((t) => [t.number, t.row, t.column, t.left, t.top]),
    ).toEqual([
      [1, 0, 0, -6, -6],
      [2, 0, 1, 166, -6],
    ]);
    expect(plan.tiles[0].width).toBe(182);
    expect(plan.tiles[0].left + plan.tiles[0].width - plan.tiles[1].left).toBe(
      10,
    );
    for (const tile of plan.tiles) {
      expect(tile.pageX).toBeGreaterThanOrEqual(10);
      expect(tile.pageY).toBeGreaterThanOrEqual(10);
      expect(tile.pageX + tile.width).toBeLessThanOrEqual(200);
      expect(tile.pageY + tile.height).toBeLessThanOrEqual(287);
    }
  });
  it("uses identical world crosses across both vertical and horizontal joins", () => {
    const plan = planPdfTiles(
      { min: { x: -100, y: -200 }, max: { x: 300, y: 500 } },
      defaultPdfLayout,
    );
    const first = plan.tiles[0],
      right = plan.tiles[1],
      below = plan.tiles[plan.columns];
    const crosses = tileRegistration(first, plan, 10);
    expect(crosses.filter((p) => p.axis === "x")).toEqual(
      tileRegistration(right, plan, 10).filter(
        (p) => p.axis === "x" && p.x === crosses[0].x,
      ),
    );
    const horizontal = crosses.filter((p) => p.axis === "y");
    expect(horizontal).toEqual(
      tileRegistration(below, plan, 10).filter(
        (p) => p.axis === "y" && p.y === horizontal[0].y,
      ),
    );
    expect(plan.tiles.map((t) => t.number)).toEqual(
      plan.tiles.map((_, i) => i + 1),
    );
  });
  it("supports landscape and configurable margins and overlap without rescaling", () => {
    const plan = planPdfTiles(bounds, {
      ...defaultPdfLayout,
      orientation: "landscape",
      marginMm: 5,
      overlapMm: 12,
    });
    expect([
      plan.paperWidth,
      plan.paperHeight,
      plan.columns,
      plan.rows,
    ]).toEqual([297, 210, 1, 2]);
    expect(plan.tiles[0].height).toBe(176);
    expect(plan.tiles[1].top - plan.tiles[0].top).toBe(164);
  });
  it("does not create an extra tile on an exact content boundary", () => {
    const plan = planPdfTiles(
      { min: { x: 0, y: 0 }, max: { x: 180, y: 251 } },
      defaultPdfLayout,
    );
    expect(plan.tiles).toHaveLength(1);
  });
  it("fits one large sheet, reserves calibration space, and honors paper orientation", () => {
    const portrait = planPdfTiles(bounds, {
      ...defaultPdfLayout,
      mode: "large",
    });
    const landscape = planPdfTiles(bounds, {
      ...defaultPdfLayout,
      mode: "large",
      orientation: "landscape",
    });
    expect(portrait.tiles).toHaveLength(1);
    expect(portrait.tiles[0].width).toBe(192);
    expect(portrait.paperHeight).toBeGreaterThan(portrait.paperWidth);
    expect(landscape.paperWidth).toBeGreaterThanOrEqual(landscape.paperHeight);
    expect(
      portrait.paperHeight - portrait.tiles[0].height,
    ).toBeGreaterThanOrEqual(170);
  });
  it("rejects invalid inputs, oversized paper and excessive tile counts", () => {
    for (const patch of [
      { marginMm: NaN },
      { marginMm: -1 },
      { marginMm: 21 },
      { overlapMm: 0 },
      { overlapMm: 51 },
    ])
      expect(() =>
        planPdfTiles(bounds, { ...defaultPdfLayout, ...patch }),
      ).toThrow(/margins/);
    expect(() =>
      planPdfTiles(
        { ...bounds, max: { x: Infinity, y: 10 } },
        defaultPdfLayout,
      ),
    ).toThrow(/finite/);
    const huge = { min: { x: 0, y: 0 }, max: { x: 10000, y: 10000 } };
    expect(() => planPdfTiles(huge, defaultPdfLayout)).toThrow(/200 tiles/);
    expect(() =>
      planPdfTiles(huge, { ...defaultPdfLayout, mode: "large" }),
    ).toThrow(/5000 mm/);
  });
});
