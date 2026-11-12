import { describe, expect, it } from "vitest";
import { addPath } from "./operations";
import { createPieceFromEdge } from "./pieces";
import { documentSchema, emptyDocument } from "./schema";
import { cutOutline, setSeamAllowance } from "./seamAllowance";
import { offsetOutline, type OffsetEdge } from "../geometry/offsets";
import { lerp, distance, project } from "../geometry/line";
import { cubicPoint } from "../geometry/bezier";
import { useEditor } from "../editor/store";
import {
  duplicatePieces,
  mirrorAround,
  transformPieces,
} from "./pieceTransforms";
function fixture(
  points = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ],
) {
  let n = 0;
  const id = () => `p${++n}`;
  let doc = addPath(emptyDocument("seam"), points, true, id);
  doc = createPieceFromEdge(
    doc,
    Object.keys(doc.segments)[0],
    "piece",
    "Panel",
  );
  return doc;
}
const settings = { widthMm: 5, join: "miter" as const, miterLimit: 4 };
const bounds = (p: { x: number; y: number }[]) => [
  Math.min(...p.map((p) => p.x)),
  Math.min(...p.map((p) => p.y)),
  Math.max(...p.map((p) => p.x)),
  Math.max(...p.map((p) => p.y)),
];
describe("M3.1 derived cut contours", () => {
  it("offsets a square exactly, independently of display units and stroke", () => {
    const doc = fixture(),
      original = structuredClone(doc);
    const next = setSeamAllowance(doc, "piece", settings);
    expect(bounds(cutOutline(next, next.pieces.piece))).toEqual([
      -5, -5, 105, 105,
    ]);
    expect(doc).toEqual(original);
    expect(next.points).toBe(doc.points);
    expect(next.segments).toBe(doc.segments);
    expect(
      bounds(cutOutline({ ...next, unitsDisplay: "in" }, next.pieces.piece)),
    ).toEqual([-5, -5, 105, 105]);
  });
  it.each(["miter", "round", "bevel"] as const)(
    "supports %s joins, winding and reflection",
    (join) => {
      let doc = setSeamAllowance(fixture(), "piece", { ...settings, join });
      const p = cutOutline(doc, doc.pieces.piece);
      expect(bounds(p)).toEqual([-5, -5, 105, 105]);
      if (join !== "miter") expect(p.length).toBeGreaterThan(4);
      const refs = doc.pieces.piece.stitchingOutline;
      expect(
        bounds(
          cutOutline(doc, {
            ...doc.pieces.piece,
            stitchingOutline: [...refs]
              .reverse()
              .map((r) => ({ ...r, reversed: !r.reversed })),
          }),
        ),
      ).toEqual(bounds(p));
      doc = transformPieces(
        doc,
        ["piece"],
        mirrorAround("x", { x: 50, y: 50 }),
      );
      expect(bounds(cutOutline(doc, doc.pieces.piece))).toEqual(bounds(p));
    },
  );
  it("keeps fold edges at zero and persists overrides on copies", () => {
    let doc = fixture();
    const edge = doc.pieces.piece.stitchingOutline[3].segmentId;
    doc = setSeamAllowance(doc, "piece", settings, { [edge]: 0 });
    expect(bounds(cutOutline(doc, doc.pieces.piece))).toEqual([
      0, -5, 105, 105,
    ]);
    let n = 0;
    const copy = duplicatePieces(doc, ["piece"], () => `copy${++n}`, {
      x: 10,
      y: 10,
    });
    const p = copy.document.pieces[copy.pieceIds[0]];
    expect(bounds(cutOutline(copy.document, p))).toEqual([10, 5, 115, 115]);
  });
  it("trims concave corners and bounds acute miters", () => {
    const doc = setSeamAllowance(
      fixture([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 50, y: 50 },
        { x: 50, y: 100 },
        { x: 0, y: 100 },
      ]),
      "piece",
      settings,
    );
    expect(cutOutline(doc, doc.pieces.piece)).toContainEqual({ x: 55, y: 55 });
    const acute = setSeamAllowance(
      fixture([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 0.1, y: 1 },
      ]),
      "piece",
      settings,
    );
    expect(bounds(cutOutline(acute, acute.pieces.piece))[2]).toBeLessThan(121);
  });
  it("bounds mixed cubic/line offset distance and recalculates after source edits", () => {
    let doc = fixture();
    const id = doc.pieces.piece.rootSegmentId,
      e = doc.segments[id];
    doc = {
      ...doc,
      segments: {
        ...doc.segments,
        [id]: {
          ...e,
          kind: "cubic",
          control1: { x: 20, y: -30 },
          control2: { x: 80, y: -30 },
        },
      },
    };
    doc = setSeamAllowance(doc, "piece", settings);
    const cut = cutOutline(doc, doc.pieces.piece);
    const curve = [
      doc.points[e.from],
      { x: 20, y: -30 },
      { x: 80, y: -30 },
      doc.points[e.to],
    ] as Parameters<typeof cubicPoint>[0];
    for (let i = 5; i < 96; i++) {
      const p = cubicPoint(curve, i / 100);
      const gap = Math.min(
        ...cut.map((a, j) => {
          const b = cut[(j + 1) % cut.length];
          return distance(p, lerp(a, b, project(a, b, p)));
        }),
      );
      expect(Math.abs(gap - 5)).toBeLessThan(0.05);
    }
    const moved = {
      ...doc,
      points: { ...doc.points, [e.from]: { x: -10, y: 0 } },
    };
    expect(cutOutline(moved, moved.pieces.piece)).not.toEqual(cut);
  });
  it("preserves history and serialized source settings over repeated cycles", () => {
    const doc = fixture();
    useEditor.getState().load(doc);
    const next = setSeamAllowance(doc, "piece", settings);
    useEditor.getState().commit(next);
    const cut = cutOutline(next, next.pieces.piece);
    for (let i = 0; i < 4; i++) {
      useEditor.getState().undo();
      expect(useEditor.getState().document).toEqual(doc);
      useEditor.getState().redo();
      const parsed = documentSchema.parse(
        JSON.parse(JSON.stringify(useEditor.getState().document)),
      );
      expect(cutOutline(parsed, parsed.pieces.piece)).toEqual(cut);
      expect(JSON.stringify(parsed)).not.toContain("cutOutline");
    }
  });
  it("migrates v8 without dropping geometry and rejects unsupported/invalid settings", () => {
    const doc = fixture();
    expect(documentSchema.parse({ ...doc, schemaVersion: 8 })).toEqual(doc);
    expect(() =>
      documentSchema.parse({ ...doc, schemaVersion: 100 }),
    ).toThrow();
    for (const widthMm of [-1, NaN, 1001])
      expect(() =>
        setSeamAllowance(doc, "piece", { ...settings, widthMm }),
      ).toThrow();
    expect(() =>
      documentSchema.parse({
        ...doc,
        pieces: {
          piece: {
            ...doc.pieces.piece,
            seamAllowance: { ...settings, widthMm: -1 },
          },
        },
      }),
    ).toThrow();
  });
  it("rejects unresolved self-crossing offsets atomically", () => {
    const doc = fixture([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 60, y: 100 },
      { x: 60, y: 20 },
      { x: 40, y: 20 },
      { x: 40, y: 100 },
      { x: 0, y: 100 },
    ]);
    const before = JSON.stringify(doc);
    expect(() =>
      setSeamAllowance(doc, "piece", { ...settings, widthMm: 15 }),
    ).toThrow(/Cut outline/);
    expect(JSON.stringify(doc)).toBe(before);
  });
  it("handles extreme translations, tiny edges, zero allowance and invalid open input", () => {
    const doc = fixture([
      { x: 9999000, y: 9999000 },
      { x: 9999100, y: 9999000 },
      { x: 9999100, y: 9999100 },
      { x: 9999000, y: 9999100 },
    ]);
    expect(
      bounds(
        cutOutline(setSeamAllowance(doc, "piece", settings), {
          ...doc.pieces.piece,
          seamAllowance: settings,
        }),
      ),
    ).toEqual([9998995, 9998995, 9999105, 9999105]);
    const tiny = fixture([
      { x: 0, y: 0 },
      { x: 0.001, y: 0 },
      { x: 0.001, y: 0.001 },
      { x: 0, y: 0.001 },
    ]);
    expect(cutOutline(tiny, tiny.pieces.piece)).toHaveLength(4);
    const line = (
      a: { x: number; y: number },
      b: { x: number; y: number },
    ): OffsetEdge => ({
      curve: [a, lerp(a, b, 1 / 3), lerp(a, b, 2 / 3), b],
      cubic: false,
      width: 5,
    });
    expect(() =>
      offsetOutline([line({ x: 0, y: 0 }, { x: 1, y: 0 })], settings),
    ).toThrow();
  });
});
it("rejects invalid cut commits without changing history or source", () => {
  const doc = fixture([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 60, y: 100 },
    { x: 60, y: 20 },
    { x: 40, y: 20 },
    { x: 40, y: 100 },
    { x: 0, y: 100 },
  ]);
  useEditor.getState().load(doc);
  const invalid = {
    ...doc,
    pieces: {
      piece: {
        ...doc.pieces.piece,
        seamAllowance: { ...settings, widthMm: 15 },
      },
    },
  };
  expect(() => useEditor.getState().commit(invalid)).toThrow();
  expect(useEditor.getState().document).toEqual(doc);
  expect(useEditor.getState().past).toHaveLength(0);
});
it("offsets a closed four-cubic circle within the documented radial bound", async () => {
  const { addEllipse } = await import("./ellipse");
  let n = 0;
  let doc = addEllipse(
    emptyDocument("circle"),
    0,
    0,
    100,
    100,
    () => `circle-${++n}`,
  );
  const p = Object.keys(doc.pieces)[0];
  doc = setSeamAllowance(doc, p, settings);
  for (const point of cutOutline(doc, doc.pieces[p]))
    expect(Math.abs(Math.hypot(point.x - 50, point.y - 50) - 55)).toBeLessThan(
      0.05,
    );
});
it("fold roles inherit zero while explicit overrides can be cleared", async () => {
  const { updateSewing } = await import("./sewing");
  let doc = fixture();
  const edge = doc.pieces.piece.stitchingOutline[3].segmentId;
  doc = updateSewing(doc, "piece", (s) => ({
    ...s,
    edges: { [edge]: { role: "fold" } },
  }));
  doc = setSeamAllowance(doc, "piece", settings);
  expect(bounds(cutOutline(doc, doc.pieces.piece))).toEqual([0, -5, 105, 105]);
  doc = setSeamAllowance(doc, "piece", settings, { [edge]: 10 });
  expect(bounds(cutOutline(doc, doc.pieces.piece))).toEqual([
    -10, -5, 105, 105,
  ]);
  doc = setSeamAllowance(doc, "piece", settings, { [edge]: undefined });
  expect(bounds(cutOutline(doc, doc.pieces.piece))).toEqual([0, -5, 105, 105]);
});
it("warns during source previews when a narrower concavity invalidates the cut", async () => {
  const { validateDocumentEdit } = await import("./contourValidation");
  let doc = fixture([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 60, y: 100 },
    { x: 60, y: 20 },
    { x: 40, y: 20 },
    { x: 40, y: 100 },
    { x: 0, y: 100 },
  ]);
  doc = setSeamAllowance(doc, "piece", settings);
  const next = structuredClone(doc);
  for (const p of Object.values(next.points)) {
    if (p.x === 60) p.x = 52;
    if (p.x === 40) p.x = 48;
  }
  expect(validateDocumentEdit(doc, next).valid).toBe(false);
  useEditor.getState().load(doc);
  expect(() => useEditor.getState().commit(next)).toThrow(/Cut outline/);
  expect(useEditor.getState().document).toEqual(doc);
});
it("changes zero/5/10 mm allowance without moving source geometry at extreme scales", () => {
  const doc = fixture([
    { x: 0, y: 0 },
    { x: 1000000, y: 0 },
    { x: 1000000, y: 1000000 },
    { x: 0, y: 1000000 },
  ]);
  for (const widthMm of [0, 5, 10, 1000]) {
    const next = setSeamAllowance(doc, "piece", { ...settings, widthMm });
    expect(bounds(cutOutline(next, next.pieces.piece))).toEqual(
      [-widthMm, -widthMm, 1000000 + widthMm, 1000000 + widthMm].map((x) =>
        x === 0 ? 0 : x,
      ),
    );
    expect(next.points).toBe(doc.points);
    expect(next.segments).toBe(doc.segments);
  }
});

it("reports final commit failures in the seam dialog without changing the source", async () => {
  const { seamCommands } = await import("../editor/seamCommands");
  const doc = fixture();
  useEditor.getState().load(doc);
  const preview = setSeamAllowance(doc, "piece", settings);
  const e = preview.segments[preview.pieces.piece.rootSegmentId];
  useEditor.setState({
    preview: {
      ...preview,
      points: { ...preview.points, [e.from]: { x: 1e8, y: 0 } },
    },
  });
  expect(seamCommands.applySeam.run()).toBe(false);
  expect(useEditor.getState().previewIssue).toBeTruthy();
  expect(useEditor.getState().document).toEqual(doc);
  expect(useEditor.getState().past).toHaveLength(0);
  useEditor.getState().cancel();
});
