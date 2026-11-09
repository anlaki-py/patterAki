import { beforeEach, expect, it } from "vitest";
import { addPath } from "../document/operations";
import { addGuide } from "../document/guides";
import { emptyDocument, type PatternDocument } from "../document/schema";
import { resolvePointerDetailed } from "./resolvePointer";
import {
  resolveSnapDetailed,
  type SnapResolutionOptions,
} from "./snapResolver";
import { insertPointAt } from "./pointTool";
import { useEditor } from "./store";

const options: SnapResolutionOptions = {
  tool: "line",
  scale: 2,
  touch: false,
  panning: false,
  snap: true,
  grid: false,
  bypass: false,
  constrain: false,
};
let index = 0;
const id = () => String(++index);
beforeEach(() => {
  index = 0;
});
const horizontal = () =>
  addPath(
    emptyDocument("test"),
    [
      { x: 0, y: 50 },
      { x: 100, y: 50 },
    ],
    false,
    id,
  );
const modes = {
  endpoints: true,
  intersections: true,
  midpoints: true,
  edges: true,
  alignments: false,
  perpendicular: true,
  guides: true,
  grid: true,
};
const resolve = (
  doc: PatternDocument,
  point: { x: number; y: number },
  overrides: Partial<SnapResolutionOptions> = {},
) => resolveSnapDetailed(doc, point, { ...options, modes, ...overrides });

it("S02 chooses the same target regardless of point insertion order", () => {
  const a: PatternDocument = {
    ...emptyDocument("a"),
    points: {
      left: { x: -2, y: 0 },
      right: { x: 2, y: 0 },
    },
  };
  const b: PatternDocument = {
    ...emptyDocument("b"),
    points: {
      right: { x: 2, y: 0 },
      left: { x: -2, y: 0 },
    },
  };
  expect(resolve(a, { x: 0, y: 0 }).chosen?.targetId).toBe("point:left");
  expect(resolve(b, { x: 0, y: 0 }).chosen?.targetId).toBe("point:left");
});

it("S03 retains a target inside 1.5x pickup and releases beyond it", () => {
  const doc: PatternDocument = {
    ...emptyDocument("hysteresis"),
    points: { a: { x: 0, y: 0 } },
  };
  const first = resolve(doc, { x: 6, y: 0 }, { scale: 1 });
  expect(first.chosen?.targetId).toBe("point:a");
  const inside = resolve(
    doc,
    { x: 10, y: 0 },
    { scale: 1, previousLock: first.lock },
  );
  expect(inside.chosen?.targetId).toBe("point:a");
  expect(inside.chosen?.point).toEqual({ x: 0, y: 0 });
  const outside = resolve(
    doc,
    { x: 12.5, y: 0 },
    { scale: 1, previousLock: first.lock },
  );
  expect(outside.chosen).toBeUndefined();
});

it("S04 lets a nearby exact endpoint replace a held grid target", () => {
  const doc: PatternDocument = {
    ...emptyDocument("grid-replace"),
    points: { a: { x: 10, y: 0 } },
  };
  const grid = resolve(doc, { x: 1, y: 1 }, { grid: true });
  expect(grid.chosen?.kind).toBe("grid");
  const endpoint = resolve(
    doc,
    { x: 10.5, y: 0 },
    {
      grid: true,
      previousLock: grid.lock,
    },
  );
  expect(endpoint.chosen?.kind).toBe("endpoint");
  expect(endpoint.chosen?.targetId).toBe("point:a");
});

it("S05 recomputes a held on-edge target from the current raw pointer", () => {
  const doc = horizontal();
  const first = resolve(doc, { x: 10, y: 52 });
  expect(first.chosen?.kind).toBe("on-edge");
  const moved = resolve(doc, { x: 24, y: 53 }, { previousLock: first.lock });
  expect(moved.chosen?.kind).toBe("on-edge");
  expect(moved.chosen?.point).toEqual({ x: 24, y: 50 });
});

it("G01 snaps to an active 45 degree ray", () => {
  const resolution = resolve(
    emptyDocument("angle"),
    { x: 40, y: 41 },
    {
      origin: { x: 0, y: 0 },
      modes: { ...modes, alignments: true },
    },
  );
  expect(resolution.chosen).toMatchObject({ kind: "angle", label: "45°" });
  expect(resolution.chosen!.point.x).toBeCloseTo(40.5, 10);
  expect(resolution.chosen!.point.y).toBeCloseTo(40.5, 10);
});

it("G02 does not invent angular guides without an active origin", () => {
  const resolution = resolve(emptyDocument("angle"), { x: 40, y: 41 });
  expect(resolution.chosen?.kind).not.toBe("angle");
});

it("G03 keeps the hard Shift constraint while magnetic snapping is off", () => {
  const resolution = resolvePointerDetailed(
    emptyDocument("angle"),
    { x: 40, y: 41 },
    {
      ...options,
      snap: false,
      bypass: true,
      constrain: true,
      origin: { x: 0, y: 0 },
    },
  );
  expect(resolution.chosen).toMatchObject({
    label: "45° constraint",
    kind: "angle",
  });
  expect(resolution.chosen?.point.x).toBeCloseTo(
    resolution.chosen!.point.y,
    10,
  );
});

it("G04 snaps to a perpendicular foot on a finite straight edge", () => {
  const resolution = resolve(
    horizontal(),
    { x: 30, y: 50 },
    {
      origin: { x: 30, y: 0 },
    },
  );
  expect(resolution.chosen).toMatchObject({
    kind: "perpendicular",
    label: "Perpendicular",
    point: { x: 30, y: 50 },
  });
});

it("G05 rejects a perpendicular foot outside the finite edge", () => {
  const resolution = resolve(
    horizontal(),
    { x: 150, y: 50 },
    {
      origin: { x: 150, y: 0 },
    },
  );
  expect(resolution.chosen?.kind).not.toBe("perpendicular");
});

it("G06 snaps at a vertical and horizontal guide crossing", () => {
  let doc = addGuide(emptyDocument("guides"), "x", 25, "v");
  doc = addGuide(doc, "y", 40, "h");
  expect(resolve(doc, { x: 25.5, y: 39.5 }).chosen).toMatchObject({
    kind: "guide-intersection",
    label: "Guide intersection",
    point: { x: 25, y: 40 },
  });
});

it("G07 snaps a guide crossing a finite edge and ignores hidden guides", () => {
  let doc = addGuide(horizontal(), "x", 50, "v");
  const vertical = doc.segments[Object.keys(doc.segments)[0]];
  expect(resolve(doc, { x: 50.5, y: 49.5 }).chosen).toMatchObject({
    kind: "guide-intersection",
    point: { x: 50, y: 50 },
    edgeId: vertical.id,
    t: 0.5,
  });
  doc = {
    ...doc,
    guides: {
      ...doc.guides,
      v: { ...doc.guides.v, visible: false },
    },
  };
  const hidden = resolve(doc, { x: 50.5, y: 49.5 });
  expect(hidden.chosen?.kind).not.toBe("guide-intersection");
});

it("G10 converts mouse and touch pickup from CSS pixels at every zoom", () => {
  const doc: PatternDocument = {
    ...emptyDocument("pickup"),
    points: { a: { x: 0, y: 0 } },
  };
  expect(resolve(doc, { x: 4, y: 0 }, { scale: 2 }).chosen?.kind).toBe(
    "endpoint",
  );
  expect(resolve(doc, { x: 4.5, y: 0 }, { scale: 2 }).chosen).toBeUndefined();
  expect(
    resolve(doc, { x: 7.5, y: 0 }, { scale: 2, touch: true }).chosen?.kind,
  ).toBe("endpoint");
  expect(
    resolve(doc, { x: 8.5, y: 0 }, { scale: 2, touch: true }).chosen,
  ).toBeUndefined();
});

it("V02 exposes grid as a distinct kind while keeping the legacy label empty", () => {
  const resolution = resolve(
    emptyDocument("grid"),
    { x: 11, y: 9 },
    {
      grid: true,
    },
  );
  expect(resolution.chosen).toMatchObject({ kind: "grid", label: "" });
  const legacy = resolvePointerDetailed(
    emptyDocument("grid"),
    { x: 11, y: 9 },
    {
      ...options,
      grid: true,
    },
  );
  expect(legacy.chosen?.kind).toBe("grid");
  expect(useEditor.getState().revision).toBe(0);
});

it("snaps to custom grid spacing on both sides of the origin", () => {
  const doc = emptyDocument("grid-custom");
  const positive = resolve(
    doc,
    { x: 7.4, y: 7.6 },
    {
      grid: true,
      gridSpacingMm: 2.5,
    },
  );
  expect(positive.chosen).toMatchObject({
    kind: "grid",
    point: { x: 7.5, y: 7.5 },
  });
  const negative = resolve(
    doc,
    { x: -7.4, y: -7.6 },
    {
      grid: true,
      gridSpacingMm: 2.5,
    },
  );
  expect(negative.chosen).toMatchObject({
    kind: "grid",
    point: { x: -7.5, y: -7.5 },
  });
});

it("keeps a parallel guide and edge as separate deterministic candidates", () => {
  let doc = addPath(
    emptyDocument("parallel"),
    [
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ],
    false,
    id,
  );
  doc = addGuide(doc, "x", 50, "v");
  const first = resolve(
    doc,
    { x: 50.2, y: 30 },
    {
      modes: { ...modes, midpoints: false },
    },
  );
  expect(first.choices.map((choice) => choice.kind)).toEqual([
    "on-edge",
    "guide",
  ]);
  expect(first.chosen?.kind).toBe("on-edge");
  expect(first.chosen?.point).toEqual({ x: 50, y: 30 });
  const second = resolve(
    doc,
    { x: 50.2, y: 30 },
    {
      modes: { ...modes, midpoints: false },
      previousLock: first.lock,
      cycleOffset: 1,
    },
  );
  expect(second.chosen?.kind).toBe("guide");
  expect(second.chosen?.targetId).toBe("guide:v");
  expect(second.chosen?.point).toEqual({ x: 50, y: 30 });
});

it("filters Add Point candidates to an insertable edge", () => {
  const doc = horizontal();
  const free = resolve(doc, { x: 50, y: 20 }, { tool: "point" });
  expect(free.chosen).toBeUndefined();
  const onEdge = resolve(doc, { x: 25, y: 49 }, { tool: "point" });
  expect(onEdge.chosen).toMatchObject({
    kind: "on-edge",
    point: { x: 25, y: 50 },
  });
  expect(onEdge.chosen?.edgeId).toBe(Object.keys(doc.segments)[0]);
});

it("S07/S09 cycles two coincident edges and inserts into the displayed edge", () => {
  const doc: PatternDocument = {
    ...emptyDocument("overlap"),
    points: {
      a1: { x: 0, y: 0 },
      b1: { x: 100, y: 0 },
      a2: { x: 0, y: 0 },
      b2: { x: 100, y: 0 },
    },
    segments: {
      s1: { id: "s1", kind: "line", from: "a1", to: "b1" },
      s2: { id: "s2", kind: "line", from: "a2", to: "b2" },
    },
  };
  const first = resolve(
    doc,
    { x: 50, y: 1 },
    {
      tool: "point",
      modes: { ...modes, midpoints: false },
    },
  );
  expect(first.choices.map((choice) => choice.targetId)).toEqual([
    "edge:s1",
    "edge:s2",
  ]);
  expect(first.chosen?.targetId).toBe("edge:s1");
  const second = resolve(
    doc,
    { x: 50, y: 1 },
    {
      tool: "point",
      modes: { ...modes, midpoints: false },
      previousLock: first.lock,
      cycleOffset: 1,
    },
  );
  expect(second.chosen?.edgeId).toBe("s2");
  expect(second.chosen?.t).toBeCloseTo(0.5, 12);

  useEditor.getState().load(doc);
  expect(
    insertPointAt({ x: 50, y: 1 }, 4, {
      edgeId: second.chosen!.edgeId!,
      t: second.chosen!.t!,
    }),
  ).toBe(true);
  const after = useEditor.getState().document;
  expect(after.segments.s1.to).toBe("b1");
  expect(after.segments.s2.to).not.toBe("b2");
  expect(Object.keys(after.segments)).toHaveLength(3);
});
