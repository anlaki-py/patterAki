import { describe, expect, it } from "vitest";
import { type Cubic, cubicPoint } from "./bezier";
import { distance, lerp } from "./line";
import { cubicIntersections } from "./intersections";
import { validateContourSegments } from "./contourValidation";
import { emptyDocument, type PatternDocument } from "../document/schema";
import { validateDocumentEdit } from "../document/contourValidation";
import { useEditor } from "../editor/store";

// A normal monotone bend whose endpoint Newton step previously rounded below 0.
const curve: Cubic = [
  { x: 145.02158287440426, y: 166.88008573450148 },
  { x: 214.02893539511598, y: 108.70418860189616 },
  { x: 287.2206972197288, y: 87.63985632531345 },
  { x: 358.32025439239106, y: 48.01974162071943 },
];
const bottom = { x: curve[0].x, y: 286.88008573450145 };
const line: Cubic = [
  bottom,
  lerp(bottom, curve[0], 1 / 3),
  lerp(bottom, curve[0], 2 / 3),
  curve[0],
];
const reverse = (c: Cubic): Cubic => [c[3], c[2], c[1], c[0]];

it.each([
  [false, false],
  [true, false],
  [false, true],
  [true, true],
])(
  "returns the exact shared endpoint with reversed directions %s/%s",
  (reverseA, reverseB) => {
    const a = reverseA ? reverse(curve) : curve,
      b = reverseB ? reverse(line) : line;
    const hits = cubicIntersections(a, b);
    expect(hits).toHaveLength(1);
    expect(hits[0].point).toEqual(curve[0]);
    expect(hits[0].t).toBe(reverseA ? 1 : 0);
    expect(hits[0].u).toBe(reverseB ? 0 : 1);
  },
);

it("accepts the ordinary closed-contour handle edit and undoes it once", () => {
  const base: PatternDocument = {
    ...emptyDocument("corner-regression"),
    points: {
      a: curve[0],
      b: curve[3],
      c: { x: curve[3].x, y: bottom.y },
      d: bottom,
    },
    segments: {
      ab: { id: "ab", kind: "line", from: "a", to: "b" },
      bc: { id: "bc", kind: "line", from: "b", to: "c" },
      cd: { id: "cd", kind: "line", from: "c", to: "d" },
      da: { id: "da", kind: "line", from: "d", to: "a" },
    },
  };
  const edited: PatternDocument = {
    ...base,
    segments: {
      ...base.segments,
      ab: {
        id: "ab",
        kind: "cubic",
        from: "a",
        to: "b",
        control1: curve[1],
        control2: curve[2],
      },
    },
  };
  expect(validateDocumentEdit(base, edited)).toEqual({
    valid: true,
    issues: [],
  });
  useEditor.getState().load(base);
  useEditor.getState().commit(edited);
  expect(useEditor.getState().past).toHaveLength(1);
  useEditor.getState().undo();
  expect(useEditor.getState().document).toEqual(base);
  useEditor.getState().redo();
  expect(useEditor.getState().document).toEqual(edited);
});

it("keeps a real interior crossing between adjacent segments despite their shared endpoint", () => {
  const a = { x: 0, y: 0 },
    b = { x: 100, y: 0 },
    c = { x: 0, y: 100 };
  const check = validateContourSegments([
    {
      id: "bend",
      kind: "cubic",
      a,
      b,
      control1: { x: -50, y: 50 },
      control2: { x: 50, y: 50 },
    },
    { id: "diagonal", kind: "line", a: b, b: c },
    { id: "side", kind: "line", a: c, b: a },
  ]);
  expect(check.valid).toBe(false);
  const crossing = check.issues.find(
    (issue) =>
      issue.segmentIds.includes("bend") && issue.segmentIds.includes("side"),
  );
  expect(crossing?.code).toBe("self-intersection");
  expect(distance(crossing!.point!, a)).toBeGreaterThan(1);
});

describe("endpoint precision across ordinary decimal-coordinate bends", () => {
  it("retains the shared corner for 500 deterministic monotone bends", () => {
    let seed = 123456;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 500; i++) {
      const a = { x: 144.57 + random(), y: 166.66 + random() },
        b = { x: a.x + 200 + random() * 30, y: a.y - 100 - random() * 20 };
      const end = { x: a.x, y: a.y + 120 };
      const bend: Cubic = [
        a,
        { x: a.x + 50 + random() * 20, y: a.y - 40 - random() * 20 },
        lerp(a, b, 2 / 3),
        b,
      ];
      const side: Cubic = [end, lerp(end, a, 1 / 3), lerp(end, a, 2 / 3), a];
      const hits = cubicIntersections(bend, side);
      expect(hits).toHaveLength(1);
      expect(distance(hits[0].point, a)).toBeLessThan(1e-9);
      expect(
        distance(cubicPoint(bend, hits[0].t), cubicPoint(side, hits[0].u)),
      ).toBeLessThan(1e-9);
    }
  });
});

it("allows a deep but noncrossing bend whose controls extend beyond the outline", () => {
  const check = validateContourSegments([
    { id: "top", kind: "line", a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
    { id: "right", kind: "line", a: { x: 100, y: 0 }, b: { x: 100, y: 100 } },
    {
      id: "bottom",
      kind: "cubic",
      a: { x: 100, y: 100 },
      b: { x: 0, y: 100 },
      control1: { x: 0, y: 200 },
      control2: { x: 100, y: -100 },
    },
    { id: "left", kind: "line", a: { x: 0, y: 100 }, b: { x: 0, y: 0 } },
  ]);
  expect(check).toEqual({ valid: true, issues: [] });
});
