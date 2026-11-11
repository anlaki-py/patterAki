import { beforeEach, expect, it } from "vitest";
import { addPath, changeLength, splitLine } from "./operations";
import { convertToCurve, moveVertex } from "./curves";
import { createPieceFromEdge, pieceEdges } from "./pieces";
import { emptyDocument, documentSchema, parseProject } from "./schema";
import { outlineArea, connectedPath } from "./pieceTopology";
import {
  applyTransform,
  duplicatePieces,
  mirrorAround,
  pieceBounds,
  rotationAround,
  transformPieces,
} from "./pieceTransforms";
import { attachInternalPath } from "./piecePathsEdit";
import { itemEditable, visibleDocument } from "./pieceAccess";
import { translateSelection } from "./selection";
import { segmentLength } from "./segments";
import { assertValidDocumentEdit } from "./contourValidation";
let n = 0;
const id = () => `m2-${++n}`;
beforeEach(() => {
  n = 0;
});
function fixture(reverse = false) {
  const positions = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 80 },
    { x: 0, y: 80 },
  ];
  const loose = addPath(
    emptyDocument("m2"),
    reverse ? positions.reverse() : positions,
    true,
    id,
  );
  return createPieceFromEdge(
    loose,
    Object.keys(loose.segments)[0],
    "panel",
    "Panel",
  );
}
it.each([false, true])(
  "normalizes either winding without changing point/segment identities: reverse=%s",
  (reverse) => {
    const doc = fixture(reverse),
      p = doc.pieces.panel;
    expect(connectedPath(doc, p.stitchingOutline, true)).toBe(true);
    expect(outlineArea(doc, p.stitchingOutline)).toBeCloseTo(8000, 8);
    expect(p.version).toBe(1);
    expect(documentSchema.parse(doc)).toEqual(doc);
  },
);
it.each([5, 6])(
  "migrates version %s identity pieces without changing geometry or guessing loose pieces",
  (schemaVersion) => {
    let doc = fixture(true);
    doc = addPath(
      doc,
      [
        { x: 200, y: 0 },
        { x: 220, y: 0 },
        { x: 220, y: 20 },
      ],
      true,
      id,
    );
    const p = doc.pieces.panel;
    const legacy = {
      ...doc,
      schemaVersion,
      pieces: {
        panel: { id: p.id, name: p.name, rootSegmentId: p.rootSegmentId },
      },
    };
    const migrated = parseProject(JSON.stringify(legacy));
    expect(migrated.points).toEqual(doc.points);
    expect(migrated.segments).toEqual(doc.segments);
    expect(Object.keys(migrated.pieces)).toEqual(["panel"]);
    expect(migrated.pieces.panel.stitchingOutline).toHaveLength(4);
    expect(legacy.schemaVersion).toBe(schemaVersion);
  },
);
it("rejects disconnected, reordered, duplicate, missing and counterclockwise outlines without changing input", () => {
  const doc = fixture(),
    refs = doc.pieces.panel.stitchingOutline;
  const invalid = [
    [refs[1], refs[0], ...refs.slice(2)],
    [...refs, refs[0]],
    [{ segmentId: "missing", reversed: false }, ...refs.slice(1)],
    [...refs].reverse().map((r) => ({ ...r, reversed: !r.reversed })),
  ];
  for (const stitchingOutline of invalid)
    expect(
      documentSchema.safeParse({
        ...doc,
        pieces: { panel: { ...doc.pieces.panel, stitchingOutline } },
      }).success,
    ).toBe(false);
  expect(parseProject(JSON.stringify(doc))).toEqual(doc);
});
it("rejects degenerate and self-crossing contours and preserves the source", () => {
  const doc = fixture(),
    edge = doc.segments[doc.pieces.panel.rootSegmentId];
  const crossed = moveVertex(doc, edge.from, { x: 110, y: 70 });
  expect(documentSchema.safeParse(crossed).success).toBe(false);
  expect(() => assertValidDocumentEdit(doc, crossed)).toThrow();
  expect(() =>
    addPath(
      emptyDocument("zero"),
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ],
      true,
      id,
    ),
  ).toThrow();
  expect(pieceBounds(doc, ["panel"]).max).toEqual({ x: 100, y: 80 });
});
it("rotation preserves arc lengths and IDs, transforms controls and keeps the recorded frame consistent", () => {
  let doc = fixture();
  const edge = doc.pieces.panel.rootSegmentId;
  doc = convertToCurve(doc, edge);
  const matrix = rotationAround(37, { x: 50, y: 40 });
  const rotated = transformPieces(doc, ["panel"], matrix);
  expect(Object.keys(rotated.points)).toEqual(Object.keys(doc.points));
  for (const [id, p] of Object.entries(doc.points))
    expect(rotated.points[id]).toEqual(applyTransform(matrix, p));
  expect(segmentLength(rotated, rotated.segments[edge])).toBeCloseTo(
    segmentLength(doc, doc.segments[edge]),
    7,
  );
  expect(rotated.pieces.panel.transform).toEqual(matrix);
  expect(parseProject(JSON.stringify(rotated))).toEqual(rotated);
});
it.each(["x", "y"] as const)(
  "mirror %s maintains canonical winding and returns exactly after two reflections",
  (axis) => {
    const doc = fixture(true),
      mirror = mirrorAround(axis, { x: 50, y: 40 });
    const reflected = transformPieces(doc, ["panel"], mirror);
    expect(
      outlineArea(reflected, reflected.pieces.panel.stitchingOutline),
    ).toBeCloseTo(8000);
    expect(
      connectedPath(reflected, reflected.pieces.panel.stitchingOutline, true),
    ).toBe(true);
    const twice = transformPieces(reflected, ["panel"], mirror);
    expect(twice.points).toEqual(doc.points);
    expect(twice.segments).toEqual(doc.segments);
  },
);
it("multiple pieces rotate and mirror about one shared pivot preserving relative positions", () => {
  const doc = fixture(),
    copied = duplicatePieces(doc, ["panel"], id, { x: 200, y: 20 });
  const ids = ["panel", ...copied.pieceIds],
    m = rotationAround(90, { x: 0, y: 0 });
  const next = transformPieces(copied.document, ids, m);
  for (const [id, p] of Object.entries(copied.document.points)) {
    const expected = applyTransform(m, p);
    expect(next.points[id].x).toBeCloseTo(expected.x, 9);
    expect(next.points[id].y).toBeCloseTo(expected.y, 9);
  }
});
it("open and closed internal paths preserve IDs through split, move, rotate, mirror, duplicate and JSON", () => {
  let doc = fixture();
  doc = addPath(
    doc,
    [
      { x: 20, y: 20 },
      { x: 40, y: 30 },
      { x: 70, y: 40 },
    ],
    false,
    id,
  );
  const looseIds = Object.keys(doc.segments).slice(-2);
  doc = attachInternalPath(doc, "panel", looseIds, "internal");
  doc = splitLine(doc, looseIds[0], 0.4, id);
  expect(doc.pieces.panel.internalPaths[0].edges).toHaveLength(3);
  expect(
    connectedPath(doc, doc.pieces.panel.internalPaths[0].edges, false),
  ).toBe(true);
  const moved = translateSelection(
    doc,
    doc.pieces.panel.stitchingOutline.map((r) => r.segmentId),
    { x: 10, y: 15 },
  );
  for (const [pid, p] of Object.entries(doc.points))
    expect(moved.points[pid]).toEqual({ ...p, x: p.x + 10, y: p.y + 15 });
  const mirrored = transformPieces(
    moved,
    ["panel"],
    mirrorAround("x", { x: 50, y: 40 }),
  );
  const copied = duplicatePieces(mirrored, ["panel"], id, { x: 200, y: 0 });
  const duplicate = copied.document.pieces[copied.pieceIds[0]];
  expect(duplicate.internalPaths[0].id).not.toBe("internal");
  expect(
    pieceEdges(copied.document, duplicate).every(
      (id) => !pieceEdges(doc, doc.pieces.panel).includes(id),
    ),
  ).toBe(true);
  expect(parseProject(JSON.stringify(copied.document))).toEqual(
    copied.document,
  );
  expect(doc.pieces.panel.metadata).toEqual(duplicate.metadata);
});
it("closed internal path attachment and malformed attachments validate without dropping loose geometry", () => {
  let doc = fixture();
  doc = addPath(
    doc,
    [
      { x: 20, y: 20 },
      { x: 40, y: 20 },
      { x: 30, y: 40 },
    ],
    true,
    id,
  );
  const edges = Object.keys(doc.segments).slice(-3);
  const attached = attachInternalPath(doc, "panel", edges, "closed-internal");
  expect(attached.pieces.panel.internalPaths[0].closed).toBe(true);
  expect(() => attachInternalPath(doc, "panel", edges, "panel")).toThrow();
  expect(() => attachInternalPath(attached, "panel", edges, "twice")).toThrow();
  expect(doc.pieces.panel.internalPaths).toEqual([]);
});
it.each([false, true])(
  "splitting curved outline retains ordered connectivity and shape in either winding: %s",
  (reverse) => {
    let doc = fixture(reverse);
    const edgeId = doc.pieces.panel.rootSegmentId;
    doc = convertToCurve(doc, edgeId);
    const originalLength = pieceEdges(doc, doc.pieces.panel).reduce(
      (n, id) => n + segmentLength(doc, doc.segments[id]),
      0,
    );
    const split = splitLine(doc, edgeId, 0.37, id),
      refs = split.pieces.panel.stitchingOutline;
    expect(refs).toHaveLength(5);
    expect(connectedPath(split, refs, true)).toBe(true);
    expect(
      refs.reduce(
        (n, r) => n + segmentLength(split, split.segments[r.segmentId]),
        0,
      ),
    ).toBeCloseTo(originalLength, 7);
    expect(documentSchema.safeParse(split).success).toBe(true);
  },
);
it("exact length edit keeps adjacent point identities and controls attached", () => {
  let doc = fixture();
  const refs = doc.pieces.panel.stitchingOutline,
    edge = doc.segments[refs[0].segmentId];
  const neighbor = pieceEdges(doc, doc.pieces.panel).find(
    (id) => id !== edge.id && doc.segments[id].from === edge.to,
  )!;
  doc = convertToCurve(doc, neighbor);
  const next = changeLength(doc, edge.id, 120, "start");
  expect(next.pieces.panel.stitchingOutline).toEqual(refs);
  expect(next.segments[neighbor].from).toBe(edge.to);
  const c = next.segments[neighbor],
    old = doc.segments[neighbor];
  if (c.kind !== "cubic" || old.kind !== "cubic")
    throw new Error("Expected curve");
  expect(c.control1.x - old.control1.x).toBe(20);
  expect(documentSchema.safeParse(next).success).toBe(true);
});
it("locks and hides geometry across direct edits, transforms and visibility filtering", () => {
  const doc = fixture(),
    locked = {
      ...doc,
      pieces: { panel: { ...doc.pieces.panel, locked: true } },
    };
  const edge = doc.pieces.panel.rootSegmentId;
  expect(itemEditable(locked, edge)).toBe(false);
  expect(() =>
    moveVertex(locked, doc.segments[edge].from, { x: 1, y: 1 }),
  ).toThrow("Locked");
  expect(() => splitLine(locked, edge, 0.5, id)).toThrow("Locked");
  expect(() =>
    transformPieces(locked, ["panel"], rotationAround(10, { x: 0, y: 0 })),
  ).toThrow("locked");
  const hidden = {
    ...doc,
    pieces: { panel: { ...doc.pieces.panel, visible: false } },
  };
  expect(Object.keys(visibleDocument(hidden).segments)).toHaveLength(0);
  expect(Object.keys(visibleDocument(hidden).points)).toHaveLength(0);
  expect(hidden.points).toEqual(doc.points);
});
it("rejects scaling, invalid rotations, ID collisions and out-of-range movement without modifying source", () => {
  const doc = fixture(),
    snapshot = structuredClone(doc);
  expect(() =>
    transformPieces(doc, ["panel"], { a: 2, b: 0, c: 0, d: 1, e: 0, f: 0 }),
  ).toThrow("scaling");
  expect(() => rotationAround(NaN, { x: 0, y: 0 })).toThrow();
  expect(() =>
    duplicatePieces(doc, ["panel"], () => "panel", { x: 10, y: 0 }),
  ).toThrow("ID");
  expect(() =>
    transformPieces(doc, ["panel"], { a: 1, b: 0, c: 0, d: 1, e: 1e8, f: 0 }),
  ).toThrow();
  expect(doc).toEqual(snapshot);
});
it("piece bounds use actual curve extrema rather than control hull", () => {
  let doc = fixture();
  const edgeId = doc.pieces.panel.rootSegmentId;
  doc = convertToCurve(doc, edgeId);
  const edge = doc.segments[edgeId];
  if (edge.kind !== "cubic") throw new Error("Expected curve");
  doc = {
    ...doc,
    segments: {
      ...doc.segments,
      [edgeId]: {
        ...edge,
        control1: { x: 0, y: -100 },
        control2: { x: 100, y: -100 },
      },
    },
  };
  expect(pieceBounds(doc, ["panel"]).min.y).toBeCloseTo(-75, 8);
  expect(documentSchema.safeParse(doc).success).toBe(true);
});

it("malformed internal references, piece versions and metadata return validation errors rather than throwing", () => {
  const doc = fixture();
  const records = [
    { ...doc.pieces.panel, version: 2 },
    {
      ...doc.pieces.panel,
      metadata: { ...doc.pieces.panel.metadata, cutQuantity: 0 },
    },
    {
      ...doc.pieces.panel,
      internalPaths: [
        {
          id: "bad-path",
          closed: false,
          edges: [{ segmentId: "absent", reversed: false }],
        },
      ],
    },
    { ...doc.pieces.panel, transform: { a: 1, b: 0, c: 1, d: 1, e: 0, f: 0 } },
  ];
  for (const panel of records)
    expect(
      documentSchema.safeParse({ ...doc, pieces: { panel } }).success,
    ).toBe(false);
});
it("area tolerance rejects tiny outlines and stays stable far from the origin", async () => {
  const { orderedOutline, PIECE_AREA_TOLERANCE_MM2 } =
    await import("./pieceTopology");
  const doc = fixture(),
    ids = doc.pieces.panel.stitchingOutline.map((r) => r.segmentId);
  const tiny = {
    ...doc,
    points: Object.fromEntries(
      Object.entries(doc.points).map(([id, p]) => [
        id,
        { x: p.x * 1e-7, y: p.y * 1e-7 },
      ]),
    ),
  };
  expect(
    Math.abs(outlineArea(tiny, doc.pieces.panel.stitchingOutline)),
  ).toBeLessThan(PIECE_AREA_TOLERANCE_MM2);
  expect(() => orderedOutline(tiny, ids)).toThrow("degenerate");
  const distant = translateSelection(doc, ids, { x: 9e6, y: -9e6 });
  expect(
    outlineArea(distant, distant.pieces.panel.stitchingOutline),
  ).toBeCloseTo(8000, 6);
  expect(documentSchema.safeParse(distant).success).toBe(true);
});

it("reshaping shared outline/internal anchors carries dependent controls and validates branched components", () => {
  let doc = fixture();
  doc = addPath(
    doc,
    [
      { x: 20, y: 20 },
      { x: 50, y: 40 },
    ],
    false,
    id,
  );
  const internalId = Object.keys(doc.segments).at(-1)!;
  doc = attachInternalPath(doc, "panel", [internalId], "attached-internal");
  doc = convertToCurve(doc, internalId);
  const anchor = doc.segments[doc.pieces.panel.rootSegmentId].from;
  doc = {
    ...doc,
    segments: {
      ...doc.segments,
      [internalId]: { ...doc.segments[internalId], from: anchor },
    },
  };
  expect(documentSchema.safeParse(doc).success).toBe(true);
  const next = moveVertex(doc, anchor, { x: -10, y: -5 });
  const curve = doc.segments[internalId],
    moved = next.segments[internalId];
  if (curve.kind !== "cubic" || moved.kind !== "cubic")
    throw new Error("Expected curve");
  expect(moved.from).toBe(anchor);
  expect(moved.control1).toEqual({
    x: curve.control1.x - 10,
    y: curve.control1.y - 5,
  });
  expect(moved.control2).toEqual(curve.control2);
  expect(documentSchema.safeParse(next).success).toBe(true);
  const crossed = moveVertex(doc, anchor, { x: 110, y: 70 });
  expect(() => assertValidDocumentEdit(doc, crossed)).toThrow();
});
