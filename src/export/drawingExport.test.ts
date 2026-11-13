import { expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { emptyDocument } from "../document/schema";
import { addPath } from "../document/operations";
import { convertToCurve } from "../document/curves";
import { newAnnotation, putAnnotation } from "../document/annotations";
import { closedCycleForEdge, createPieceFromEdge } from "../document/pieces";
import { drawingScope, resolveExportScope } from "./drawingScope";
import { exportSvg } from "./svg";
import { pdfDrawing, defaultPdfLayers } from "./pdfDrawing";
import { exportPdf } from "./pdf";
import { defaultPdfLayout } from "./tiling";

const svgOptions = {
  cut: true,
  stitch: true,
  internal: true,
  marks: true,
  metadata: true,
};
function fixture() {
  let sequence = 0;
  const id = () => `raw-${++sequence}`;
  let doc = addPath(
    emptyDocument("raw-drawing"),
    [
      { x: 0, y: 0 },
      { x: 180, y: 0 },
      { x: 180, y: 240 },
      { x: 0, y: 240 },
    ],
    true,
    id,
  );
  doc = addPath(
    doc,
    [
      { x: 0, y: 0 },
      { x: 80, y: 120 },
    ],
    false,
    id,
  );
  doc = addPath(
    doc,
    [
      { x: 30, y: 30 },
      { x: 140, y: 70 },
    ],
    false,
    id,
  );
  doc = convertToCurve(doc, Object.keys(doc.segments).at(-1)!);
  doc = putAnnotation(doc, newAnnotation("button", { x: 20, y: 20 }, "button"));
  doc = putAnnotation(doc, newAnnotation("text", { x: 10, y: 250 }, "label"));
  return { doc, id };
}
it("exports a branched frame, inside lines, curves and marks without creating any piece", async () => {
  const { doc } = fixture(),
    before = structuredClone(doc);
  const root = Object.keys(doc.segments)[0];
  expect(closedCycleForEdge(doc, root)).toBeUndefined();
  expect(drawingScope(doc, []).initial).toBe("drawing");
  const target = resolveExportScope(doc, [], "drawing", true);
  const svg = exportSvg(doc, target.pieceIds, { ...svgOptions, ...target });
  expect(svg.match(/data-segment=/g)).toHaveLength(6);
  expect(svg).toContain(" C ");
  expect(svg).toContain('data-annotation="button"');
  expect(svg).toContain('data-annotation="label"');
  expect(svg).not.toContain("data-piece=");
  const drawing = pdfDrawing(
    doc,
    target.pieceIds,
    defaultPdfLayers,
    target.annotations,
    target.drawing,
  );
  expect(drawing.paths.filter((p) => p.role === "drawing")).toHaveLength(6);
  expect(drawing.texts).toHaveLength(2);
  const bytes = await exportPdf(doc, [], {
    ...defaultPdfLayout,
    layers: defaultPdfLayers,
    ...target,
  });
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  expect(doc).toEqual(before);
  expect(doc.pieces).toEqual({});
});
it("exports only selected loose lines and marks, with exact canonical coordinates", () => {
  const { doc } = fixture(),
    selected = [Object.keys(doc.segments)[0], "button"];
  const target = resolveExportScope(doc, selected, "selection", true);
  expect(target.pieceIds).toEqual([]);
  const svg = exportSvg(doc, [], { ...svgOptions, ...target });
  expect(svg.match(/data-segment=/g)).toHaveLength(1);
  expect(svg).toContain('d="M 0 0 L 180 0"');
  expect(svg).toContain('data-annotation="button"');
  expect(svg).not.toContain('data-annotation="label"');
  const drawing = pdfDrawing(doc, [], defaultPdfLayers, false, target.drawing);
  expect(drawing.paths.filter((p) => p.role === "drawing")).toEqual([
    { path: "M 0 0 L 180 0", role: "drawing", dash: undefined },
  ]);
});
it("includes mixed pieces and loose drawing once, and excludes hidden piece geometry", () => {
  const { doc: original, id } = fixture();
  let doc = original;
  const existing = new Set(Object.keys(doc.segments));
  doc = addPath(
    doc,
    [
      { x: 300, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 80 },
      { x: 300, y: 80 },
    ],
    true,
    id,
  );
  const root = Object.keys(doc.segments).find((id) => !existing.has(id))!;
  doc = createPieceFromEdge(doc, root, "panel");
  doc.pieces.panel.locked = true;
  let target = resolveExportScope(doc, [], "drawing", true);
  let svg = exportSvg(doc, target.pieceIds, {
    ...svgOptions,
    cut: false,
    ...target,
  });
  expect(svg.match(/data-segment=/g)).toHaveLength(6);
  expect(svg.match(/data-role="seam"/g)).toHaveLength(4);
  expect(svg).toContain('data-piece="panel"');
  doc.pieces.panel.visible = false;
  target = resolveExportScope(doc, [root], "drawing", true);
  svg = exportSvg(doc, target.pieceIds, { ...svgOptions, ...target });
  expect(svg).not.toContain('data-piece="panel"');
  expect(target.drawing?.segmentIds).not.toContain(root);
  expect(resolveExportScope(doc, [root], "selection", true).hasContent).toBe(
    false,
  );
});
it("exports marks alone using their actual bounds rather than the document origin", async () => {
  const doc = putAnnotation(
    emptyDocument("marks"),
    newAnnotation("button", { x: 500, y: 600 }, "button"),
  );
  const target = resolveExportScope(doc, [], "drawing", true);
  const svg = exportSvg(doc, [], { ...svgOptions, ...target });
  expect(svg).toContain('width="35mm" height="35mm"');
  expect(svg).toContain('viewBox="482.5 582.5 35 35"');
  const bytes = await exportPdf(doc, [], {
    ...defaultPdfLayout,
    mode: "large",
    layers: defaultPdfLayers,
    ...target,
  });
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
});
it.each([false, true])(
  "exports a single %s-axis line as SVG and printable PDF",
  async (vertical) => {
    let seq = 0;
    const doc = addPath(
      emptyDocument("line"),
      [{ x: 20, y: 30 }, vertical ? { x: 20, y: 130 } : { x: 120, y: 30 }],
      false,
      () => `line-${++seq}`,
    );
    const target = resolveExportScope(doc, [], "drawing", true);
    expect(exportSvg(doc, [], { ...svgOptions, ...target })).toContain(
      vertical ? 'width="20mm" height="120mm"' : 'width="120mm" height="20mm"',
    );
    for (const mode of ["a4", "large"] as const) {
      const bytes = await exportPdf(doc, [], {
        ...defaultPdfLayout,
        mode,
        layers: defaultPdfLayers,
        ...target,
      });
      expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    }
  },
);
it("rejects empty, missing and invalid export data without modifying the drawing", () => {
  const { doc } = fixture(),
    before = structuredClone(doc);
  for (const drawing of [
    { segmentIds: ["missing"], annotationIds: [] },
    { segmentIds: [], annotationIds: ["missing"] },
    { segmentIds: [], annotationIds: [] },
  ]) {
    expect(() =>
      exportSvg(doc, [], { ...svgOptions, annotations: false, drawing }),
    ).toThrow();
    expect(() =>
      pdfDrawing(doc, [], defaultPdfLayers, false, drawing),
    ).toThrow();
  }
  expect(() =>
    exportSvg({ ...doc, schemaVersion: 99 } as never, [], {
      ...svgOptions,
      annotations: true,
    }),
  ).toThrow(/invalid/);
  expect(doc).toEqual(before);
});
it("can turn off loose lines while retaining marks and existing piece-only scopes", () => {
  const { doc } = fixture();
  const target = resolveExportScope(doc, [], "drawing", false);
  expect(target.drawing?.segmentIds).toEqual([]);
  const svg = exportSvg(doc, [], { ...svgOptions, ...target });
  expect(svg).not.toContain("data-segment=");
  expect(svg).toContain("data-annotation=");
  expect(resolveExportScope(doc, [], "selection", true).hasContent).toBe(false);
});

it("preserves guide-only piece exports and rejects unbounded guides without drawing geometry", () => {
  let sequence = 0;
  let doc = addPath(
    emptyDocument("guides"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ],
    true,
    () => `guide-${++sequence}`,
  );
  doc = createPieceFromEdge(doc, Object.keys(doc.segments)[0], "panel");
  doc.guides.horizontal = {
    id: "horizontal",
    axis: "y",
    positionMm: 40,
    locked: false,
    visible: true,
  };
  const layers = Object.fromEntries(
    Object.keys(defaultPdfLayers).map((key) => [key, key === "guides"]),
  ) as typeof defaultPdfLayers;
  expect(pdfDrawing(doc, ["panel"], layers, false).paths).toEqual([
    { path: "M 0 40 L 100 40", role: "guide", dash: [2, 2] },
  ]);
  expect(() => pdfDrawing(doc, [], layers, false)).toThrow(/geometry/);
});
