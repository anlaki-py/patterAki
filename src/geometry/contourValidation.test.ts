import { beforeEach, expect, it } from "vitest";
import { addPath } from "../document/operations";
import { emptyDocument, type PatternDocument } from "../document/schema";
import {
  documentCycles,
  validateDocumentContours,
  validateDocumentEdit,
} from "../document/contourValidation";
import {
  cubicSelfIntersections,
  validateClosedPositions,
  validateContourSegments,
} from "./contourValidation";
import { type Cubic } from "./bezier";

let counter = 0;
const id = () => String(++counter);
beforeEach(() => {
  counter = 0;
});
const closed = (points: { x: number; y: number }[]) =>
  addPath(emptyDocument("closed"), points, true, id);
const square = () =>
  closed([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ]);
const manually = (
  points: Record<string, { x: number; y: number }>,
  edges: [string, string, string][],
): PatternDocument => ({
  ...emptyDocument("manual"),
  points,
  segments: Object.fromEntries(
    edges.map(([edgeId, from, to]) => [
      edgeId,
      { id: edgeId, kind: "line" as const, from, to },
    ]),
  ),
});

it("C01 accepts a rectangle and a simple closed polyline", () => {
  expect(validateDocumentContours(square()).valid).toBe(true);
  expect(
    validateClosedPositions([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 120, y: 80 },
      { x: 40, y: 120 },
      { x: -20, y: 60 },
    ]).valid,
  ).toBe(true);
});

it("C02 rejects a bow-tie before it becomes a document", () => {
  const bow = [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
    { x: 100, y: 0 },
  ];
  const check = validateClosedPositions(bow);
  expect(check.valid).toBe(false);
  expect(check.issues[0].code).toBe("self-intersection");
  expect(() => closed(bow)).toThrow("Closed contour is invalid");
  expect(emptyDocument("still-empty").segments).toEqual({});
});

it("C03 allows adjacent endpoints and rejects a nonadjacent self-touch", () => {
  expect(
    validateClosedPositions([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 80 },
    ]).valid,
  ).toBe(true);
  const touching = validateClosedPositions([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 50, y: 50 },
    { x: 50, y: 0 },
    { x: 0, y: 100 },
  ]);
  expect(touching.valid).toBe(false);
  expect(touching.issues[0].code).toBe("self-intersection");
});

it("C04 rejects a nonadjacent line/cubic crossing in a closed contour", () => {
  const segments = [
    {
      id: "top",
      kind: "line" as const,
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
    },
    {
      id: "right",
      kind: "line" as const,
      a: { x: 100, y: 0 },
      b: { x: 100, y: 100 },
    },
    {
      id: "loop",
      kind: "cubic" as const,
      a: { x: 100, y: 100 },
      b: { x: 0, y: 100 },
      control1: { x: 0, y: 200 },
      control2: { x: 100, y: -300 },
    },
    {
      id: "left",
      kind: "line" as const,
      a: { x: 0, y: 100 },
      b: { x: 0, y: 0 },
    },
  ];
  const check = validateContourSegments(segments);
  expect(check.valid).toBe(false);
  expect(
    check.issues.some(
      (issue) =>
        issue.code === "self-intersection" &&
        issue.segmentIds.includes("top") &&
        issue.segmentIds.includes("loop"),
    ),
  ).toBe(true);
});

it("C05 detects a single cubic crossing itself at two interior parameters", () => {
  const loop: Cubic = [
    { x: 0, y: 0 },
    { x: 200, y: 300 },
    { x: -100, y: 100 },
    { x: 100, y: 0 },
  ];
  const hits = cubicSelfIntersections(loop);
  expect(hits).toHaveLength(1);
  expect(hits[0].t).toBeGreaterThan(0);
  expect(hits[0].t).toBeLessThan(1);
  expect(hits[0].u).toBeGreaterThan(0);
  expect(hits[0].u).toBeLessThan(1);
  expect(hits[0].t).not.toBeCloseTo(hits[0].u, 6);
  const arch: Cubic = [
    { x: 0, y: 0 },
    { x: 0, y: 100 },
    { x: 100, y: 100 },
    { x: 100, y: 0 },
  ];
  expect(cubicSelfIntersections(arch)).toEqual([]);
});

it("C06 leaves separate open lines and separate closed contours alone", () => {
  let doc = addPath(
    emptyDocument("open"),
    [
      { x: 0, y: 50 },
      { x: 100, y: 50 },
    ],
    false,
    id,
  );
  doc = addPath(
    doc,
    [
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ],
    false,
    id,
  );
  expect(documentCycles(doc)).toEqual([]);
  expect(validateDocumentContours(doc).valid).toBe(true);
  const first = square();
  const second = {
    points: {
      a: { x: 50, y: 50 },
      b: { x: 150, y: 50 },
      c: { x: 150, y: 150 },
      d: { x: 50, y: 150 },
    },
    segments: {
      a: { id: "a", kind: "line" as const, from: "a", to: "b" },
      b: { id: "b", kind: "line" as const, from: "b", to: "c" },
      c: { id: "c", kind: "line" as const, from: "c", to: "d" },
      d: { id: "d", kind: "line" as const, from: "d", to: "a" },
    },
  };
  const both: PatternDocument = {
    ...first,
    points: { ...first.points, ...second.points },
    segments: { ...first.segments, ...second.segments },
  };
  expect(validateDocumentContours(both).valid).toBe(true);
});

it("C07 rejects a vertex move that creates a self-crossing contour", () => {
  const before = square();
  const vertex = Object.values(before.points).find(
    (point) => point.x === 100 && point.y === 100,
  )!;
  const id = Object.keys(before.points).find(
    (key) => before.points[key] === vertex,
  )!;
  const after = {
    ...before,
    points: { ...before.points, [id]: { x: 100, y: -100 } },
  };
  const check = validateDocumentEdit(before, after);
  expect(check.valid).toBe(false);
  expect(check.issues[0].code).toBe("self-intersection");
});

it("C08 reports overlaps and ignores unrelated pre-existing invalid cycles", () => {
  const overlap = validateContourSegments([
    { id: "a", kind: "line", a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
    { id: "b", kind: "line", a: { x: 100, y: 0 }, b: { x: 0, y: 0 } },
    { id: "c", kind: "line", a: { x: 0, y: 0 }, b: { x: 0, y: 50 } },
  ]);
  expect(overlap.valid).toBe(false);
  expect(overlap.issues.some((issue) => issue.code === "overlap")).toBe(true);

  const invalid = manually(
    {
      a: { x: 0, y: 0 },
      b: { x: 100, y: 100 },
      c: { x: 0, y: 100 },
      d: { x: 100, y: 0 },
      e: { x: 300, y: 300 },
      f: { x: 400, y: 300 },
    },
    [
      ["ab", "a", "b"],
      ["bc", "b", "c"],
      ["cd", "c", "d"],
      ["da", "d", "a"],
      ["ef", "e", "f"],
    ],
  );
  const edited = {
    ...invalid,
    points: { ...invalid.points, f: { x: 400, y: 350 } },
  };
  expect(validateDocumentEdit(invalid, edited).valid).toBe(true);
});
