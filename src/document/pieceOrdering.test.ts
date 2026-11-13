import { expect, it } from "vitest";
import { emptyDocument, documentSchema, parseProject } from "./schema";
import { createPieceFromEdge } from "./pieces";
import { connectedPath, orderedOutline, outlineArea } from "./pieceTopology";
import { splitLine } from "./operations";

function fixture(curved = false) {
  const doc = emptyDocument("id-order");
  doc.points = {
    "z-origin": { x: 0, y: 0 },
    "a-top-right": { x: 100, y: 0 },
    "m-bottom-right": { x: 100, y: 80 },
    "n-bottom-left": { x: 0, y: 80 },
  };
  doc.segments = {
    "a-edge": {
      id: "a-edge",
      kind: "line",
      from: "z-origin",
      to: "a-top-right",
    },
    "z-edge": {
      id: "z-edge",
      kind: "line",
      from: "a-top-right",
      to: "m-bottom-right",
    },
    "y-edge": {
      id: "y-edge",
      kind: "line",
      from: "m-bottom-right",
      to: "n-bottom-left",
    },
    "x-edge": {
      id: "x-edge",
      kind: "line",
      from: "n-bottom-left",
      to: "z-origin",
    },
  };
  if (curved)
    doc.segments["a-edge"] = {
      ...doc.segments["a-edge"],
      kind: "cubic",
      control1: { x: 30, y: -10 },
      control2: { x: 70, y: -10 },
    };
  return doc;
}
it.each([false, true])(
  "creates a piece when cycle traversal starts at the first edge's to endpoint: curved=%s",
  (curved) => {
    const doc = fixture(curved),
      original = structuredClone(doc);
    for (const root of Object.keys(doc.segments)) {
      const next = createPieceFromEdge(doc, root, "panel");
      expect(
        connectedPath(next, next.pieces.panel.stitchingOutline, true),
      ).toBe(true);
      expect(
        outlineArea(next, next.pieces.panel.stitchingOutline),
      ).toBeGreaterThan(0);
      expect(next.pieces.panel.rootSegmentId).toBe(root);
      expect(documentSchema.parse(next)).toEqual(next);
      expect(next.points).toEqual(original.points);
      expect(next.segments).toEqual(original.segments);
    }
    expect(doc).toEqual(original);
  },
);
it.each([5, 6])(
  "migrates a v%s piece whose legacy cycle starts in reverse without changing IDs",
  (schemaVersion) => {
    const legacy = fixture();
    legacy.segments = Object.fromEntries(
      Object.entries(legacy.segments).reverse(),
    );
    const source = {
      ...legacy,
      schemaVersion,
      pieces: {
        panel: { id: "panel", name: "Front", rootSegmentId: "a-edge" },
      },
    };
    const before = JSON.stringify(source);
    const doc = parseProject(before);
    expect(doc.schemaVersion).toBe(10);
    expect(connectedPath(doc, doc.pieces.panel.stitchingOutline, true)).toBe(
      true,
    );
    expect(doc.points).toEqual(source.points);
    expect(doc.segments).toEqual(source.segments);
    expect(JSON.stringify(source)).toBe(before);
  },
);
it.each([false, true])(
  "preserves a previously split contour when converting: curved=%s",
  (curved) => {
    let n = 0;
    const doc = splitLine(
      fixture(curved),
      "a-edge",
      0.37,
      () => ["0-split", "b-new-edge"][n++],
    );
    const next = createPieceFromEdge(doc, "b-new-edge", "panel");
    expect(next.pieces.panel.stitchingOutline).toHaveLength(5);
    expect(connectedPath(next, next.pieces.panel.stitchingOutline, true)).toBe(
      true,
    );
    expect(next.points).toEqual(doc.points);
    expect(next.segments).toEqual(doc.segments);
  },
);
it("accepts either direction of a cyclic edge order but rejects disconnected orders without mutation", () => {
  const doc = fixture(),
    ids = ["a-edge", "z-edge", "y-edge", "x-edge"],
    before = JSON.stringify(doc);
  expect(connectedPath(doc, orderedOutline(doc, ids), true)).toBe(true);
  expect(
    connectedPath(doc, orderedOutline(doc, [...ids].reverse()), true),
  ).toBe(true);
  expect(() => orderedOutline(doc, [ids[0], ids[2], ids[1], ids[3]])).toThrow(
    "connected",
  );
  expect(JSON.stringify(doc)).toBe(before);
});

function permutations(values: string[]): string[][] {
  return values.length === 0
    ? [[]]
    : values.flatMap((value, index) =>
        permutations(values.filter((_, i) => i !== index)).map((rest) => [
          value,
          ...rest,
        ]),
      );
}
it("conversion is independent of point-ID sorting and every combination of stored edge directions", () => {
  const positions = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 80 },
    { x: 0, y: 80 },
  ];
  const edgeIds = ["edge-9", "edge-1", "edge-5", "edge-3"];
  for (const points of permutations(["a", "b", "c", "d"]))
    for (let mask = 0; mask < 16; mask++) {
      const doc = emptyDocument("permuted");
      doc.points = Object.fromEntries(
        points.map((id, i) => [id, positions[i]]),
      );
      doc.segments = Object.fromEntries(
        edgeIds.map((id, i) => {
          const a = points[i],
            b = points[(i + 1) % 4],
            reverse = !!(mask & (1 << i));
          return [
            id,
            {
              id,
              kind: "line" as const,
              from: reverse ? b : a,
              to: reverse ? a : b,
            },
          ];
        }),
      );
      const next = createPieceFromEdge(doc, edgeIds[0], "panel");
      expect(
        connectedPath(next, next.pieces.panel.stitchingOutline, true),
      ).toBe(true);
      expect(outlineArea(next, next.pieces.panel.stitchingOutline)).toBeCloseTo(
        8000,
        8,
      );
      expect(documentSchema.safeParse(next).success).toBe(true);
      expect(next.points).toEqual(doc.points);
      expect(next.segments).toEqual(doc.segments);
    }
});
