import { beforeEach, expect, it } from "vitest";
import { addPath } from "../document/operations";
import { addGuide } from "../document/guides";
import { emptyDocument, type PatternDocument } from "../document/schema";
import {
  commitTranslation,
  constrainToAxis,
  movementAxis,
  resolveGroupMovement,
  resolveVertexMovement,
  type MovementSnapOptions,
} from "./movement";
import { defaultSettings } from "./settings";
import { useEditor } from "./store";

const options: MovementSnapOptions = {
  scale: 2,
  touch: false,
  alt: false,
  snap: true,
  grid: false,
  modes: { ...defaultSettings.snapModes, alignments: false },
  gridSpacingMm: 10,
  mouseRadiusPx: 8,
  touchRadiusPx: 16,
  releaseMultiplier: 1.5,
  showGuides: true,
  snapGuides: true,
};
let sequence = 0;
beforeEach(() => {
  sequence = 0;
  useEditor.getState().load(emptyDocument("movement"));
});
const id = () => String(++sequence);
const square = () => {
  sequence = 0;
  return addPath(
    emptyDocument("square"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
    true,
    id,
  );
};

it("M01 snaps a moving vertex to a stationary endpoint exactly", () => {
  let doc = addPath(
    emptyDocument("m"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    false,
    id,
  );
  doc = addPath(
    doc,
    [
      { x: 60, y: 40 },
      { x: 60, y: 50 },
    ],
    false,
    id,
  );
  const moving = Object.keys(doc.points)[1];
  const result = resolveVertexMovement(
    doc,
    moving,
    { x: 60.5, y: 40.5 },
    {
      ...options,
      modes: { ...options.modes, endpoints: true },
    },
  );
  expect(result.chosen?.kind).toBe("endpoint");
  expect(result.point).toEqual({ x: 60, y: 40 });
  expect(result.preview.points[moving]).toEqual({ x: 60, y: 40 });
});

it("M03 never snaps a moving edge to its own endpoints or edges", () => {
  const doc = addPath(
    emptyDocument("self"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    false,
    id,
  );
  const edge = Object.keys(doc.segments)[0];
  const result = resolveGroupMovement(
    doc,
    [edge],
    { x: 50, y: 0 },
    { x: 99, y: 0 },
    options,
  );
  expect(result.chosen).toBeUndefined();
  expect(result.delta).toEqual({ x: 49, y: 0 });
});

it("M02 moves a selected edge by the applied delta exactly once", () => {
  let doc = addPath(
    emptyDocument("group"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    false,
    id,
  );
  doc = addPath(
    doc,
    [
      { x: 60, y: 5 },
      { x: 60, y: 30 },
    ],
    false,
    id,
  );
  const edge = Object.keys(doc.segments)[0];
  const result = resolveGroupMovement(
    doc,
    [edge],
    { x: 50, y: 0 },
    { x: 60, y: 4.5 },
    options,
  );
  expect(result.chosen?.kind).toBe("endpoint");
  expect(result.delta).toEqual({ x: 10, y: 5 });
  const selected = doc.segments[edge];
  expect(result.preview.points[selected.from]).toEqual({ x: 10, y: 5 });
  expect(result.preview.points[selected.to]).toEqual({ x: 110, y: 5 });
});

it("M05 locks the dominant axis, holds it and rejects off-axis snaps", () => {
  expect(movementAxis(null, { x: 8, y: 3 }, true)).toBe("x");
  expect(movementAxis("x", { x: 4, y: 90 }, true)).toBe("x");
  expect(movementAxis("x", { x: 4, y: 90 }, false)).toBeNull();
  expect(constrainToAxis({ x: 0, y: 0 }, { x: 8, y: 3 }, "x")).toEqual({
    x: 8,
    y: 0,
  });
  let doc = addPath(
    emptyDocument("axis"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    false,
    id,
  );
  const moving = Object.keys(doc.points)[1];
  doc = {
    ...doc,
    points: { ...doc.points, target: { x: 100, y: 20 } },
  };
  const result = resolveVertexMovement(
    doc,
    moving,
    { x: 100, y: 19 },
    {
      ...options,
      axisLock: "x",
    },
  );
  expect(result.point.y).toBe(0);
  expect(result.chosen?.point.y ?? 0).toBe(0);
});

it("M04 snaps vertex movement to a construction guide", () => {
  let doc = addPath(
    emptyDocument("guide-move"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    false,
    id,
  );
  doc = addGuide(doc, "x", 25, "v");
  const moving = Object.keys(doc.points)[1];
  const result = resolveVertexMovement(
    doc,
    moving,
    { x: 24.5, y: 10.5 },
    {
      ...options,
      modes: { ...options.modes, guides: true },
    },
  );
  expect(result.chosen?.kind).toBe("guide");
  expect(result.point).toEqual({ x: 25, y: 10.5 });
  expect(result.preview.points[moving]).toEqual({ x: 25, y: 10.5 });
});

it("M04 snaps vertex movement to the configured grid", () => {
  const doc = addPath(
    emptyDocument("grid-move"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    false,
    id,
  );
  const moving = Object.keys(doc.points)[1];
  const result = resolveVertexMovement(
    doc,
    moving,
    { x: 19.6, y: 19.6 },
    {
      ...options,
      grid: true,
      gridSpacingMm: 10,
    },
  );
  expect(result.chosen).toMatchObject({
    kind: "grid",
    point: { x: 20, y: 20 },
  });
  expect(result.preview.points[moving]).toEqual({ x: 20, y: 20 });
});

it("M06 commits a decimal numeric move as one undo entry", () => {
  const doc = square();
  useEditor.getState().load(doc);
  const moving = Object.keys(doc.points).find(
    (key) => doc.points[key].x === 100 && doc.points[key].y === 100,
  )!;
  useEditor.setState({ activePoint: moving, selected: [] });
  commitTranslation({ x: 2.5, y: -3 });
  expect(useEditor.getState().document.points[moving]).toEqual({
    x: 102.5,
    y: 97,
  });
  expect(useEditor.getState().past).toHaveLength(1);
  useEditor.getState().undo();
  expect(useEditor.getState().document).toEqual(doc);
});

it("C07 rejects an invalid numeric contour move without history or partial geometry", () => {
  const doc = square();
  useEditor.getState().load(doc);
  const moving = Object.keys(doc.points).find(
    (key) => doc.points[key].x === 100 && doc.points[key].y === 100,
  )!;
  useEditor.setState({ activePoint: moving, selected: [] });
  expect(() => commitTranslation({ x: 0, y: -200 })).toThrow(
    "Closed contour is invalid",
  );
  expect(useEditor.getState().document).toEqual(doc);
  expect(useEditor.getState().past).toHaveLength(0);
});

it("M09 resolves a shared vertex once when two selected edges move together", () => {
  const doc: PatternDocument = square();
  const ids = Object.keys(doc.segments);
  const result = resolveGroupMovement(
    { ...doc, points: { ...doc.points, far: { x: 210, y: 105 } } },
    [ids[0], ids[1]],
    { x: 50, y: 0 },
    { x: 60, y: 5 },
    options,
  );
  const shared = doc.segments[ids[0]].to;
  expect(result.preview.points[shared]).toEqual({
    x: doc.points[shared].x + 10,
    y: doc.points[shared].y + 5,
  });
});
