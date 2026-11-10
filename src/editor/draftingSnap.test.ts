import { beforeEach, describe, expect, it } from "vitest";
import { useEditor } from "./store";
import { addPath } from "../document/operations";
import { addGuide } from "../document/guides";
import { emptyDocument, type PatternDocument } from "../document/schema";
import {
  resolvePointerDetailed,
  type ResolvePointerOptions,
} from "./resolvePointer";

const options: ResolvePointerOptions = {
  tool: "line",
  scale: 2,
  touch: false,
  panning: false,
  snap: true,
  grid: false,
  bypass: false,
  constrain: false,
};
let next = 0;
const id = () => String(++next);
beforeEach(() => {
  next = 0;
  useEditor.setState({ hasDraft: false });
});

function line(
  a: { x: number; y: number },
  b: { x: number; y: number },
): PatternDocument {
  return addPath(emptyDocument("perpendicular"), [a, b], false, id);
}
const snap = (
  doc: PatternDocument,
  point: { x: number; y: number },
  overrides: Partial<ResolvePointerOptions> = {},
) => resolvePointerDetailed(doc, point, { ...options, ...overrides });

describe("Shift direction lock with magnetic snapping", () => {
  it("can snap to a real endpoint exactly on the constrained line", () => {
    const doc = {
      ...emptyDocument("endpoint"),
      points: { p: { x: 50, y: 0 } },
    };
    const result = snap(
      doc,
      { x: 48.8, y: 0.4 },
      {
        origin: { x: 0, y: 0 },
        constrain: true,
      },
    );
    expect(result.chosen).toMatchObject({
      kind: "endpoint",
      targetId: "point:p",
      point: { x: 50, y: 0 },
    });
  });

  it("aligns to the X coordinate of another point without tilting the line", () => {
    const doc = {
      ...emptyDocument("aligned"),
      points: { p: { x: 60, y: 20 } },
    };
    const result = snap(
      doc,
      { x: 59.5, y: 0.6 },
      {
        origin: { x: 0, y: 0 },
        constrain: true,
      },
    );
    expect(result.chosen).toMatchObject({
      kind: "alignment",
      point: { x: 60, y: 0 },
    });
    expect(result.chosen?.targetId).toBe("shift:x:p");
  });

  it("preserves a 45-degree line while snapping its length", () => {
    const doc = {
      ...emptyDocument("diagonal"),
      points: { p: { x: 40, y: 40 } },
    };
    const result = snap(
      doc,
      { x: 39.3, y: 40.1 },
      {
        origin: { x: 0, y: 0 },
        constrain: true,
      },
    );
    expect(result.chosen?.point).toEqual({ x: 40, y: 40 });
  });

  it("intersects the constrained ray with a nearby straight edge", () => {
    const doc = line({ x: 52, y: 0 }, { x: 52, y: 100 });
    const result = snap(
      doc,
      { x: 51.6, y: 52.3 },
      {
        origin: { x: 0, y: 0 },
        constrain: true,
      },
    );
    expect(result.chosen?.targetId).toMatch(/^shift:edge:/);
    expect(result.chosen?.point.y).toBeCloseTo(52);
    expect(result.chosen?.point.x).toBeCloseTo(52);
  });

  it("can hit a construction guide without releasing Shift", () => {
    const doc = addGuide(emptyDocument("guide"), "x", 80, "v");
    const result = snap(
      doc,
      { x: 79, y: 0.3 },
      {
        origin: { x: 0, y: 0 },
        constrain: true,
      },
    );
    expect(result.chosen?.point.x).toBeCloseTo(80);
    expect(result.chosen?.point.y).toBeCloseTo(0);
  });

  it("keeps the hard constraint when Alt bypasses magnetism", () => {
    const doc = {
      ...emptyDocument("bypass"),
      points: { p: { x: 60, y: 20 } },
    };
    const result = snap(
      doc,
      { x: 59.5, y: 0.6 },
      {
        origin: { x: 0, y: 0 },
        constrain: true,
        bypass: true,
      },
    );
    expect(result.chosen).toMatchObject({
      targetId: "constraint:shift",
      kind: "angle",
    });
    expect(result.chosen?.point.y).toBeCloseTo(0);
  });

  it("still constrains when snapping is off", () => {
    const result = snap(
      emptyDocument("off"),
      { x: 39.3, y: 40.1 },
      {
        origin: { x: 0, y: 0 },
        constrain: true,
        snap: false,
      },
    );
    expect(result.chosen?.targetId).toBe("constraint:shift");
    expect(result.chosen!.point.x).toBeCloseTo(result.chosen!.point.y);
  });
});

describe("perpendicular construction snapping", () => {
  it("projects a new line to exactly 90 degrees from a nearby oblique edge", () => {
    const doc = line({ x: 0, y: 0 }, { x: 40, y: 40 });
    const result = snap(
      doc,
      { x: 39.6, y: -9.3 },
      {
        origin: { x: 20, y: 10 },
      },
    );
    expect(result.chosen?.targetId).toMatch(/^perpendicular-ray:/);
    const p = result.chosen!.point;
    const direction = { x: p.x - 20, y: p.y - 10 };
    // Dot product against the existing edge's direction must be zero.
    expect(direction.x + direction.y).toBeCloseTo(0, 8);
  });

  it("prioritizes a true perpendicular foot when ending on the edge", () => {
    const doc = line({ x: 0, y: 50 }, { x: 100, y: 50 });
    const result = snap(
      doc,
      { x: 30.7, y: 50.8 },
      {
        origin: { x: 30, y: 0 },
      },
    );
    expect(result.chosen).toMatchObject({
      kind: "perpendicular",
      label: "Perpendicular",
      point: { x: 30, y: 50 },
    });
  });

  it("does not snap against a distant unrelated edge", () => {
    const doc = line({ x: 0, y: 0 }, { x: 40, y: 40 });
    const result = snap(
      doc,
      { x: 520, y: 480 },
      {
        origin: { x: 500, y: 500 },
      },
    );
    expect(result.chosen?.targetId?.startsWith("perpendicular-ray:")).not.toBe(
      true,
    );
  });

  it("respects the perpendicular snap-mode toggle", () => {
    const doc = line({ x: 0, y: 0 }, { x: 40, y: 40 });
    const result = snap(
      doc,
      { x: 39.6, y: -9.3 },
      {
        origin: { x: 20, y: 10 },
        modes: {
          endpoints: true,
          intersections: true,
          midpoints: true,
          edges: true,
          alignments: true,
          perpendicular: false,
          guides: true,
          grid: false,
        },
      },
    );
    expect(result.chosen?.targetId?.startsWith("perpendicular-ray:")).not.toBe(
      true,
    );
  });
});

describe("exact Shift angles on final placement", () => {
  it("maintains exactly identical X for a 90° line, even with decimal origins", () => {
    const doc = emptyDocument("exact-vertical");
    const origin = { x: 23.7, y: 11.13 };
    const result = snap(
      doc,
      { x: 23.93, y: 85.02 },
      {
        origin,
        constrain: true,
      },
    );
    expect(result.chosen?.point.x).toBe(origin.x);
    expect(result.chosen?.point.y).toBeGreaterThan(origin.y);
  });

  it("keeps the origin X after a snapping candidate is selected", () => {
    const origin = { x: 23.7, y: 11.13 };
    const doc = {
      ...emptyDocument("shift-magnetic"),
      points: {
        endpoint: { x: origin.x, y: 85 },
      },
    };
    const result = snap(
      doc,
      { x: 23.89, y: 84.8 },
      {
        origin,
        constrain: true,
      },
    );
    expect(result.chosen?.point).toEqual({ x: origin.x, y: 85 });
  });

  it("does not drop Shift angle lock when the final click lacks an origin", () => {
    const doc = emptyDocument("final-click");
    useEditor.getState().load(doc);
    useEditor.setState({ hasDraft: true, tool: "line" });
    const origin = { x: 23.7, y: 11.13 };
    const pointer = { x: 23.83, y: 85.02 };
    const preview = snap(doc, pointer, { origin, constrain: true });
    const placed = snap(doc, pointer, { constrain: true });
    expect(preview.chosen?.point.x).toBe(origin.x);
    expect(placed.chosen?.point.x).toBe(origin.x);
    expect(placed.chosen?.point).toEqual(preview.chosen?.point);
    useEditor.getState().cancel();
  });

  it("keeps horizontal geometry exactly horizontal", () => {
    const origin = { x: 72.5, y: 18.35 };
    const result = snap(
      emptyDocument("exact-horizontal"),
      { x: 145.2, y: 18.49 },
      {
        origin,
        constrain: true,
      },
    );
    expect(result.chosen?.point.y).toBe(origin.y);
  });
});

it("retains the perpendicular snap on the final click, even without an explicit origin", () => {
  const doc = line({ x: 0, y: 50 }, { x: 100, y: 50 });
  useEditor.getState().load(doc);
  useEditor.setState({ hasDraft: true, tool: "line" });
  const pointer = { x: 30.7, y: 50.8 };
  const preview = snap(doc, pointer, { origin: { x: 30, y: 0 } });
  const committed = snap(doc, pointer);
  expect(preview.chosen?.point).toEqual({ x: 30, y: 50 });
  expect(committed.chosen?.point).toEqual({ x: 30, y: 50 });
  useEditor.getState().cancel();
});
