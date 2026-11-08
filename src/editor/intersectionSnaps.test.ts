import { beforeEach, expect, it } from "vitest";
import { convertToCurve, moveHandle, moveVertex } from "../document/curves";
import { addPath } from "../document/operations";
import { emptyDocument, type PatternDocument } from "../document/schema";
import { asCubic, segmentPoint } from "../document/segments";
import { cubicIntersections } from "../geometry/intersections";
import { distance, type Vec2 } from "../geometry/line";
import { intersectionSnaps } from "./intersectionSnaps";
let index = 0;
const id = () => String(++index);
beforeEach(() => {
  index = 0;
});
const addSegment = (doc: PatternDocument, a: Vec2, b: Vec2) => {
  const next = addPath(doc, [a, b], false, id);
  return { doc: next, edge: Object.keys(next.segments).at(-1)! };
};
const crossingFixture = () => {
  const horizontal = addSegment(
    emptyDocument("test"),
    { x: 0, y: 50 },
    { x: 100, y: 50 },
  );
  const vertical = addSegment(
    horizontal.doc,
    { x: 50, y: 0 },
    { x: 50, y: 100 },
  );
  return {
    doc: vertical.doc,
    horizontal: horizontal.edge,
    vertical: vertical.edge,
  };
};
const archAgainstLine = (lineY: number, lineFirst = false) => {
  let doc = emptyDocument("test");
  const addLine = (a: Vec2, b: Vec2) => {
    const added = addSegment(doc, a, b);
    doc = added.doc;
    return added.edge;
  };
  const lineBefore = lineFirst
    ? addLine({ x: -20, y: lineY }, { x: 120, y: lineY })
    : undefined;
  const archEdge = addLine({ x: 0, y: 0 }, { x: 100, y: 0 });
  doc = moveHandle(
    moveHandle(convertToCurve(doc, archEdge), archEdge, "control1", {
      x: 0,
      y: 100,
    }),
    archEdge,
    "control2",
    { x: 100, y: 100 },
  );
  const lineEdge =
    lineBefore ?? addLine({ x: -20, y: lineY }, { x: 120, y: lineY });
  return { doc, archEdge, lineEdge };
};
const curveCrossingFixture = () => {
  const arch = addSegment(
    emptyDocument("test"),
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  );
  const archEdge = arch.edge;
  let doc = moveHandle(
    moveHandle(convertToCurve(arch.doc, archEdge), archEdge, "control1", {
      x: 0,
      y: 100,
    }),
    archEdge,
    "control2",
    { x: 100, y: 100 },
  );
  const mirror = addSegment(doc, { x: 0, y: 100 }, { x: 100, y: 100 });
  const mirrorEdge = mirror.edge;
  doc = moveHandle(
    moveHandle(convertToCurve(mirror.doc, mirrorEdge), mirrorEdge, "control1", {
      x: 0,
      y: 0,
    }),
    mirrorEdge,
    "control2",
    { x: 100, y: 0 },
  );
  return { doc, archEdge, mirrorEdge };
};
it("returns no candidates for invalid pointers, tolerances, or empty documents", () => {
  const { doc } = crossingFixture();
  expect(intersectionSnaps(doc, { x: Number.NaN, y: 50 }, 4)).toEqual([]);
  expect(intersectionSnaps(doc, { x: 50, y: Infinity }, 4)).toEqual([]);
  expect(intersectionSnaps(doc, { x: 52, y: 51 }, 0)).toEqual([]);
  expect(intersectionSnaps(doc, { x: 52, y: 51 }, -1)).toEqual([]);
  expect(intersectionSnaps(doc, { x: 52, y: 51 }, Number.NaN)).toEqual([]);
  expect(intersectionSnaps(emptyDocument("test"), { x: 0, y: 0 }, 4)).toEqual(
    [],
  );
});
it("collects a finite line crossing with the sorted first edge and its parameter", () => {
  const { doc, horizontal } = crossingFixture();
  expect(intersectionSnaps(doc, { x: 52, y: 51 }, 4)).toEqual([
    {
      point: { x: 50, y: 50 },
      label: "Intersection",
      edgeId: horizontal,
      t: 0.5,
    },
  ]);
});
it.each([false, true])(
  "T09 finds both line/cubic crossings when the line is added first: %s",
  (lineFirst) => {
    const { doc, archEdge, lineEdge } = archAgainstLine(50, lineFirst);
    const hits = cubicIntersections(
      asCubic(doc, doc.segments[archEdge]),
      asCubic(doc, doc.segments[lineEdge]),
    );
    expect(hits).toHaveLength(2);
    const targetEdge = archEdge < lineEdge ? archEdge : lineEdge;
    for (const hit of hits) {
      const snaps = intersectionSnaps(
        doc,
        { x: hit.point.x + 0.5, y: hit.point.y + 0.5 },
        4,
      );
      const match = snaps.find(
        (snap) => distance(snap.point, hit.point) < 1e-6,
      );
      expect(match).toMatchObject({
        label: "Intersection",
        edgeId: targetEdge,
      });
      expect(match?.t).toBeGreaterThanOrEqual(0);
      expect(match?.t).toBeLessThanOrEqual(1);
      expect(
        distance(
          segmentPoint(doc, doc.segments[targetEdge], match!.t!),
          hit.point,
        ),
      ).toBeLessThan(1e-4);
    }
  },
);
it("T10 returns one deduplicated candidate at a tangent", () => {
  const { doc, archEdge, lineEdge } = archAgainstLine(75);
  const hits = cubicIntersections(
    asCubic(doc, doc.segments[archEdge]),
    asCubic(doc, doc.segments[lineEdge]),
  );
  expect(hits).toHaveLength(1);
  const snaps = intersectionSnaps(
    doc,
    { x: hits[0].point.x + 0.4, y: hits[0].point.y + 0.4 },
    4,
  );
  expect(snaps).toHaveLength(1);
  expect(distance(snaps[0].point, hits[0].point)).toBeLessThan(1e-6);
  expect(snaps[0]).toMatchObject({ label: "Intersection" });
});
it("T11 finds both crossings between two curved segments", () => {
  const { doc, archEdge, mirrorEdge } = curveCrossingFixture();
  const hits = cubicIntersections(
    asCubic(doc, doc.segments[archEdge]),
    asCubic(doc, doc.segments[mirrorEdge]),
  );
  expect(hits).toHaveLength(2);
  const targetEdge = archEdge < mirrorEdge ? archEdge : mirrorEdge;
  for (const hit of hits) {
    const snaps = intersectionSnaps(
      doc,
      { x: hit.point.x + 0.5, y: hit.point.y + 0.5 },
      4,
    );
    const match = snaps.find((snap) => distance(snap.point, hit.point) < 1e-6);
    expect(match).toMatchObject({ label: "Intersection", edgeId: targetEdge });
    expect(
      distance(
        segmentPoint(doc, doc.segments[targetEdge], match!.t!),
        hit.point,
      ),
    ).toBeLessThan(1e-4);
  }
});
it("T12 does not generate crossings for parallel, distant, or hull-only overlaps", () => {
  let doc = addSegment(
    emptyDocument("test"),
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ).doc;
  doc = addSegment(doc, { x: 0, y: 10 }, { x: 100, y: 10 }).doc;
  expect(intersectionSnaps(doc, { x: 50, y: 5 }, 4)).toEqual([]);
  for (let i = 0; i < 100; i++)
    doc = addSegment(
      doc,
      { x: 1000 + i * 20, y: 1000 },
      { x: 1050 + i * 20, y: 1000 },
    ).doc;
  expect(intersectionSnaps(doc, { x: 50, y: 5 }, 4)).toEqual([]);
  let finite = addSegment(
    emptyDocument("test"),
    { x: 0, y: 0 },
    { x: 4, y: 0 },
  );
  finite = addSegment(finite.doc, { x: -2, y: -1 }, { x: 1, y: 1 });
  expect(intersectionSnaps(finite.doc, { x: 0, y: 0.5 }, 4)).toEqual([]);
  const hull = addSegment(
    emptyDocument("test"),
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  );
  const archEdge = hull.edge;
  let hullDoc = moveHandle(
    moveHandle(convertToCurve(hull.doc, archEdge), archEdge, "control1", {
      x: 0,
      y: 100,
    }),
    archEdge,
    "control2",
    { x: 100, y: 100 },
  );
  hullDoc = addSegment(hullDoc, { x: -20, y: 80 }, { x: 120, y: 80 }).doc;
  expect(intersectionSnaps(hullDoc, { x: 50, y: 80 }, 4)).toEqual([]);
});
it("T14 skips overlapping straight edges but keeps other valid crossings", () => {
  let doc = addSegment(
    emptyDocument("test"),
    { x: 0, y: 50 },
    { x: 100, y: 50 },
  ).doc;
  doc = addSegment(doc, { x: 20, y: 50 }, { x: 80, y: 50 }).doc;
  expect(() => intersectionSnaps(doc, { x: 50, y: 50 }, 4)).not.toThrow();
  expect(intersectionSnaps(doc, { x: 50, y: 50 }, 4)).toEqual([]);
  doc = addSegment(doc, { x: 50, y: 0 }, { x: 50, y: 100 }).doc;
  const snaps = intersectionSnaps(doc, { x: 51, y: 51 }, 4);
  expect(snaps).toHaveLength(1);
  expect(snaps[0].point).toEqual({ x: 50, y: 50 });
});
it("T14 skips overlapping cubics without inventing a crossing", () => {
  const first = addSegment(
    emptyDocument("test"),
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  );
  const second = addSegment(first.doc, { x: 0, y: 0 }, { x: 100, y: 0 });
  let doc = second.doc;
  for (const edge of [first.edge, second.edge])
    doc = moveHandle(
      moveHandle(convertToCurve(doc, edge), edge, "control1", { x: 0, y: 100 }),
      edge,
      "control2",
      { x: 100, y: 100 },
    );
  expect(() => intersectionSnaps(doc, { x: 50, y: 50 }, 4)).not.toThrow();
  expect(intersectionSnaps(doc, { x: 50, y: 50 }, 4)).toEqual([]);
});
it("T15 deduplicates several segments crossing at one point and keeps the target stable", () => {
  let doc = addSegment(
    emptyDocument("test"),
    { x: 0, y: 50 },
    { x: 100, y: 50 },
  );
  const horizontal = doc.edge;
  doc = addSegment(doc.doc, { x: 50, y: 0 }, { x: 50, y: 100 });
  doc = addSegment(doc.doc, { x: 0, y: 0 }, { x: 100, y: 100 });
  const snaps = intersectionSnaps(doc.doc, { x: 51, y: 51 }, 4);
  expect(snaps).toHaveLength(1);
  expect(snaps[0]).toMatchObject({
    point: { x: 50, y: 50 },
    label: "Intersection",
    edgeId: horizontal,
    t: 0.5,
  });
  expect(intersectionSnaps(doc.doc, { x: 51, y: 51 }, 4)).toEqual(snaps);
});
it("T17 uses fresh geometry after an edit rather than stale dynamic-document results", () => {
  const { doc, horizontal } = crossingFixture();
  expect(intersectionSnaps(doc, { x: 51, y: 51 }, 4)[0].point).toEqual({
    x: 50,
    y: 50,
  });
  const edge = doc.segments[horizontal];
  let moved = moveVertex(doc, edge.from, {
    x: doc.points[edge.from].x,
    y: 60,
  });
  moved = moveVertex(moved, edge.to, { x: doc.points[edge.to].x, y: 60 });
  expect(intersectionSnaps(moved, { x: 51, y: 51 }, 4)).toEqual([]);
  expect(intersectionSnaps(moved, { x: 51, y: 61 }, 4)[0].point).toEqual({
    x: 50,
    y: 60,
  });
  expect(intersectionSnaps(doc, { x: 51, y: 51 }, 4)[0].point).toEqual({
    x: 50,
    y: 50,
  });
});
it("does not swallow unexpected geometry errors", () => {
  const broken = {
    ...emptyDocument("test"),
    segments: {
      broken: {
        id: "broken",
        kind: "line",
        from: "missing-a",
        to: "missing-b",
      },
    },
  } as unknown as PatternDocument;
  expect(() => intersectionSnaps(broken, { x: 0, y: 0 }, 4)).toThrow();
});
