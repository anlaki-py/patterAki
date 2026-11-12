import { describe, expect, it } from "vitest";
import { emptyDocument, documentSchema, parseProject } from "./schema";
import { addPath, splitLine, changeLength } from "./operations";
import { createPieceFromEdge } from "./pieces";
import {
  edgeAllowance,
  notchPoint,
  updateSewing,
  dartPoints,
  resolvedMark,
} from "./sewing";
import { emptySewing } from "./sewingSchema";
import {
  duplicatePieces,
  transformPieces,
  rotationAround,
} from "./pieceTransforms";
import { mirrorOnFold, unfoldPiece } from "./unfold";
import { addEllipse } from "./ellipse";
import { exportSewingSvg } from "../export/svg";
import { attachInternalPath } from "./piecePathsEdit";
import { segmentLength } from "./segments";
import { bendCurve } from "./curves";
let count = 0;
const id = () => `sew-${++count}`;
function fixture() {
  let doc = addPath(
    emptyDocument("sewing-test"),
    [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
      { x: 0, y: 200 },
    ],
    true,
    id,
  );
  const edges = Object.keys(doc.segments);
  doc = createPieceFromEdge(doc, edges[0], "front", "Front & lining");
  doc = updateSewing(doc, "front", (s) => ({
    ...s,
    edges: { [edges[3]]: { role: "fold" } },
    notches: [
      { id: id(), segmentId: edges[0], fraction: 0.15, style: "V", depthMm: 3 },
    ],
    marks: [
      {
        id: id(),
        kind: "grainline",
        position: { x: 60, y: 80 },
        rotation: 90,
        lengthMm: 80,
      },
    ],
    darts: [
      {
        id: id(),
        center: { x: 100, y: 20 },
        rotation: 0,
        intakeMm: 20,
        depthMm: 100,
      },
    ],
  }));
  return { doc, edges };
}
describe("M2.2 sewing semantics", () => {
  it("preserves all metadata and records through JSON and rejects corrupt references", () => {
    const { doc } = fixture();
    doc.pieces.front.metadata = {
      size: "M",
      fabric: "Cotton",
      cutQuantity: 2,
      onFold: true,
      mirroredPair: true,
      notes: "<wash>",
      version: "A",
    };
    expect(parseProject(JSON.stringify(doc))).toEqual(doc);
    const broken = structuredClone(doc);
    broken.pieces.front.sewing!.notches[0].segmentId = "missing";
    expect(documentSchema.safeParse(broken).success).toBe(false);
    expect(doc.pieces.front.sewing!.notches[0].segmentId).not.toBe("missing");
  });
  it("migrates validated v7 without changing geometry and refuses relabelled sewing data", () => {
    const { doc } = fixture();
    const legacy = structuredClone(doc);
    delete legacy.pieces.front.sewing;
    expect(documentSchema.parse({ ...legacy, schemaVersion: 7 })).toEqual(
      legacy,
    );
    expect(documentSchema.safeParse({ ...doc, schemaVersion: 7 }).success).toBe(
      false,
    );
  });
  it("defaults fold allowance to zero and supports explicit overrides", () => {
    const { doc, edges } = fixture();
    expect(edgeAllowance(doc.pieces.front, edges[3], 10)).toBe(0);
    expect(edgeAllowance(doc.pieces.front, edges[0], 10)).toBe(10);
  });
  it("notches survive unrelated resizing and split migration with exact arc placement", () => {
    const { doc, edges } = fixture(),
      original = notchPoint(doc, doc.pieces.front.sewing!.notches[0]).position;
    const changed = changeLength(doc, edges[1], 180, "start");
    expect(
      notchPoint(changed, changed.pieces.front.sewing!.notches[0]).position,
    ).toEqual(original);
    const split = splitLine(doc, edges[0], 0.1, id),
      notch = split.pieces.front.sewing!.notches[0];
    expect(notch.segmentId).not.toBe(edges[0]);
    expect(notchPoint(split, notch).position.x).toBeCloseTo(30, 9);
    expect(documentSchema.safeParse(split).success).toBe(true);
  });
  it("splits cubic notch attachments using arc length rather than parameter", () => {
    const { doc, edges } = fixture();
    const curve = bendCurve(doc, edges[0], 0.3, { x: 30, y: -40 });
    const original = notchPoint(
      curve,
      curve.pieces.front.sewing!.notches[0],
    ).position;
    const split = splitLine(curve, edges[0], 0.1, id);
    const actual = notchPoint(
      split,
      split.pieces.front.sewing!.notches[0],
    ).position;
    expect(actual.x).toBeCloseTo(original.x, 3);
    expect(actual.y).toBeCloseTo(original.y, 3);
  });
  it("keeps local darts and grainlines attached through rotation and duplication", () => {
    const { doc } = fixture();
    const rotated = transformPieces(
      doc,
      ["front"],
      rotationAround(90, { x: 0, y: 0 }),
    );
    const mark = resolvedMark(
      rotated,
      rotated.pieces.front,
      rotated.pieces.front.sewing!.marks[0],
    );
    expect(mark.position.x).toBeCloseTo(-80);
    expect(mark.position.y).toBeCloseTo(60);
    const copy = duplicatePieces(rotated, ["front"], id, { x: 10, y: 10 }),
      p = copy.document.pieces[copy.pieceIds[0]];
    expect(p.sewing!.notches[0].segmentId).not.toBe(
      doc.pieces.front.sewing!.notches[0].segmentId,
    );
    expect(p.sewing!.darts[0].id).not.toBe(
      doc.pieces.front.sewing!.darts[0].id,
    );
    expect(dartPoints(p.sewing!.darts[0])).toEqual({
      legA: { x: 90, y: 20 },
      legB: { x: 110, y: 20 },
      apex: { x: 100, y: 120 },
    });
  });
  it("mirrors about a designated fold and unfolds into one welded stitching loop", () => {
    const { doc, edges } = fixture();
    const mirrored = mirrorOnFold(doc, "front", edges[3]);
    expect(Object.values(mirrored.points).some((p) => p.x === -200)).toBe(true);
    const unfolded = unfoldPiece(doc, "front", edges[3], id);
    expect(Object.keys(unfolded.pieces)).toEqual(["front"]);
    expect(unfolded.pieces.front.stitchingOutline).toHaveLength(6);
    expect(unfolded.segments[edges[3]]).toBeUndefined();
    expect(unfolded.pieces.front.sewing!.notches).toHaveLength(2);
    expect(unfolded.pieces.front.sewing!.marks).toHaveLength(2);
    expect(unfolded.pieces.front.sewing!.darts).toHaveLength(2);
    expect(unfolded.pieces.front.metadata.onFold).toBe(false);
    expect(documentSchema.safeParse(unfolded).success).toBe(true);
  });
  it("refuses curved folds and fold notches without losing geometry", () => {
    const { doc, edges } = fixture();
    const original = JSON.stringify(doc);
    const broken = updateSewing(doc, "front", (s) => ({
      ...s,
      notches: [{ ...s.notches[0], segmentId: edges[3] }],
    }));
    expect(() => unfoldPiece(broken, "front", edges[3], id)).toThrow(/notches/);
    expect(JSON.stringify(doc)).toBe(original);
  });
  it("exports role layers, escaped printable metadata and open construction paths without making boundaries", () => {
    let { doc } = fixture();
    const previous = new Set(Object.keys(doc.segments));
    doc = addPath(
      doc,
      [
        { x: 20, y: 30 },
        { x: 80, y: 30 },
      ],
      false,
      id,
    );
    const loose = Object.keys(doc.segments).filter((key) => !previous.has(key));
    doc = attachInternalPath(doc, "front", loose, "inside");
    doc = updateSewing(doc, "front", (s) => ({
      ...s,
      paths: { inside: { role: "placement", visible: true, export: true } },
    }));
    const svg = exportSewingSvg(doc, ["front"], {
      internal: true,
      marks: true,
      metadata: true,
    });
    expect(svg).toContain('data-role="placement"');
    expect(svg).toContain("Front &amp; lining");
    expect(svg).toContain('data-role="stitch-outline"');
    expect(svg).toContain('mm"');
    const hidden = updateSewing(doc, "front", (s) => ({
      ...s,
      paths: { inside: { role: "construction", visible: true, export: false } },
    }));
    expect(
      exportSewingSvg(hidden, ["front"], {
        internal: true,
        marks: false,
        metadata: false,
      }),
    ).not.toContain('data-role="construction"');
    expect(hidden.pieces.front.stitchingOutline).toHaveLength(4);
  });
  it("creates editable ellipse arcs with physical dimensions and rejects invalid sizes", () => {
    const doc = addEllipse(emptyDocument("ellipse"), 10, 20, 120, 80, id);
    expect(Object.values(doc.segments)).toHaveLength(4);
    expect(Object.values(doc.segments).every((e) => e.kind === "cubic")).toBe(
      true,
    );
    expect(
      Object.values(doc.segments).reduce(
        (sum, e) => sum + segmentLength(doc, e),
        0,
      ),
    ).toBeGreaterThan(300);
    expect(() => addEllipse(doc, 0, 0, -1, 80, id)).toThrow();
    expect(emptySewing().notches).toEqual([]);
  });
});
it("attaches a reflected legacy grainline without losing text or direction", async () => {
  const { newAnnotation, putAnnotation } = await import("./annotations");
  const { attachAnnotation } = await import("./sewing");
  const { doc, edges } = fixture();
  let mark = newAnnotation("grainline", { x: 40, y: 50 }, id());
  if (mark.kind !== "grainline") throw new Error("fixture");
  mark = { ...mark, label: "Grain direction", rotation: 37, fontSizeMm: 5 };
  const mirrored = mirrorOnFold(putAnnotation(doc, mark), "front", edges[3]);
  const attached = attachAnnotation(mirrored, "front", mark.id, id());
  const p = attached.pieces.front;
  const actual = resolvedMark(attached, p, p.sewing!.marks.at(-1)!);
  expect(actual.position.x).toBeCloseTo(40);
  expect(actual.position.y).toBeCloseTo(50);
  expect(actual.rotation).toBeCloseTo(37);
  expect(actual.label).toBe(mark.label);
  expect(attached.annotations[mark.id]).toBeUndefined();
});
it("internal visibility removes hits and snaps without deleting exportable geometry", async () => {
  const { visibleDocument, itemVisible } = await import("./pieceAccess");
  const { doc } = fixture();
  const prior = new Set(Object.keys(doc.segments));
  let next = addPath(
    doc,
    [
      { x: 40, y: 40 },
      { x: 80, y: 60 },
    ],
    false,
    id,
  );
  const edge = Object.keys(next.segments).find((key) => !prior.has(key))!;
  next = attachInternalPath(next, "front", [edge], "hidden-path");
  next = updateSewing(next, "front", (s) => ({
    ...s,
    paths: {
      "hidden-path": { role: "construction", visible: false, export: true },
    },
  }));
  expect(itemVisible(next, edge)).toBe(false);
  expect(visibleDocument(next).segments[edge]).toBeUndefined();
  expect(next.segments[edge]).toBeDefined();
  expect(
    exportSewingSvg(next, ["front"], {
      internal: true,
      marks: false,
      metadata: false,
    }),
  ).toContain('data-role="construction"');
});
it("rejects duplicate sewing IDs, negative intake and locked edits transactionally", () => {
  const { doc } = fixture(),
    original = JSON.stringify(doc);
  expect(() =>
    updateSewing(doc, "front", (s) => ({
      ...s,
      darts: [{ ...s.darts[0], intakeMm: -1 }],
    })),
  ).toThrow();
  expect(() =>
    updateSewing(doc, "front", (s) => ({
      ...s,
      darts: [{ ...s.darts[0], id: s.notches[0].id }],
    })),
  ).toThrow();
  const locked = structuredClone(doc);
  locked.pieces.front.locked = true;
  expect(() => updateSewing(locked, "front", (s) => s)).toThrow(/unlocked/);
  expect(JSON.stringify(doc)).toBe(original);
});
it("preserves fold symbols as interior records and every open internal path when unfolding", () => {
  let { doc } = fixture();
  const edges = doc.pieces.front.stitchingOutline.map((r) => r.segmentId);
  const before = new Set(Object.keys(doc.segments));
  doc = addPath(
    doc,
    [
      { x: 20, y: 30 },
      { x: 60, y: 50 },
    ],
    false,
    id,
  );
  const loose = Object.keys(doc.segments).filter((key) => !before.has(key));
  doc = attachInternalPath(doc, "front", loose, "unfold-internal");
  doc = updateSewing(doc, "front", (s) => ({
    ...s,
    paths: {
      "unfold-internal": { role: "placement", visible: false, export: true },
    },
    marks: [
      ...s.marks,
      {
        id: id(),
        kind: "fold",
        position: { x: 0, y: 0 },
        rotation: 0,
        lengthMm: 80,
        segmentId: edges[3],
      },
    ],
  }));
  const next = unfoldPiece(doc, "front", edges[3], id);
  expect(next.pieces.front.internalPaths).toHaveLength(2);
  expect(Object.values(next.pieces.front.sewing!.paths)).toEqual([
    { role: "placement", visible: false, export: true },
    { role: "placement", visible: false, export: true },
  ]);
  expect(next.pieces.front.sewing!.marks).toHaveLength(4);
  expect(
    next.pieces.front.sewing!.marks.every((m) => m.segmentId !== edges[3]),
  ).toBe(true);
});
it("keeps edge-attached marks in place when their own edge splits", () => {
  const { doc, edges } = fixture();
  const marked = updateSewing(doc, "front", (s) => ({
    ...s,
    marks: [
      {
        id: id(),
        kind: "fold",
        position: { x: 0, y: 0 },
        rotation: 0,
        lengthMm: 40,
        segmentId: edges[0],
      },
    ],
  }));
  const before = resolvedMark(
    marked,
    marked.pieces.front,
    marked.pieces.front.sewing!.marks[0],
  );
  const split = splitLine(marked, edges[0], 0.2, id);
  const after = resolvedMark(
    split,
    split.pieces.front,
    split.pieces.front.sewing!.marks[0],
  );
  expect(after.position.x).toBeCloseTo(before.position.x, 6);
  expect(after.position.y).toBeCloseTo(before.position.y, 6);
});
it("refuses generated IDs that collide with sewing records without replacing existing geometry", () => {
  const { doc } = fixture();
  const before = JSON.stringify(doc),
    existing = doc.pieces.front.sewing!.marks[0].id;
  expect(() => addEllipse(doc, 0, 0, 100, 100, () => existing)).toThrow(
    /existing/,
  );
  expect(() =>
    duplicatePieces(doc, ["front"], () => existing, { x: 0, y: 0 }),
  ).toThrow(/existing/);
  expect(JSON.stringify(doc)).toBe(before);
});
it("exports each stitch edge once so fold dashes have no solid underlay", () => {
  const { doc } = fixture();
  const svg = exportSewingSvg(doc, ["front"], {
    internal: false,
    marks: false,
    metadata: false,
  });
  expect(svg.match(/<path /g)).toHaveLength(4);
  expect(svg).toContain('data-role="fold" stroke-dasharray="8 3"');
});
it("rejects extreme imported sewing angles before drawing can produce nonfinite coordinates", () => {
  const { doc } = fixture();
  expect(() =>
    updateSewing(doc, "front", (s) => ({
      ...s,
      darts: [{ ...s.darts[0], rotation: 1e308 }],
    })),
  ).toThrow();
  expect(() =>
    updateSewing(doc, "front", (s) => ({
      ...s,
      marks: [{ ...s.marks[0], rotation: -1e308 }],
    })),
  ).toThrow();
});
