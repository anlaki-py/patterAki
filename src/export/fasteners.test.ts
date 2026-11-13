import { expect, it } from "vitest";
import {
  PDFDocument,
  PDFRawStream,
  PDFArray,
  decodePDFRawStream,
} from "pdf-lib";
import { newAnnotation, putAnnotation } from "../document/annotations";
import { emptyDocument } from "../document/schema";
import { addPath } from "../document/operations";
import { createPieceFromEdge } from "../document/pieces";
import { exportAnnotation } from "./annotations";
import { exportSvg } from "./svg";
import { defaultPdfLayers, pdfDrawing } from "./pdfDrawing";
import { exportPdf } from "./pdf";
import { defaultPdfLayout, PDF_POINTS_PER_MM } from "./tiling";
import { annotationShape } from "../document/annotationGeometry";
import { transformMarkPoint } from "../geometry/marks";
import { markCurvePath } from "../geometry/markCurves";
import type { Cubic } from "../geometry/bezier";

function fixture() {
  let sequence = 0;
  let doc = addPath(
    emptyDocument("exports"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ],
    true,
    () => `edge-${++sequence}`,
  );
  doc = createPieceFromEdge(doc, Object.keys(doc.segments)[0], "panel");
  const hole = newAnnotation("buttonhole", { x: 30, y: 40 }, "hole");
  if (hole.kind !== "buttonhole") throw new Error("Expected buttonhole");
  doc = putAnnotation(doc, {
    ...hole,
    style: "keyhole",
    lengthMm: 30,
    widthMm: 2,
    eyeLengthMm: 6,
    eyeWidthMm: 5,
    rotation: 90,
  });
  for (const kind of ["button", "eyelet", "snap", "bartack"] as const)
    doc = putAnnotation(doc, newAnnotation(kind, { x: 50, y: 50 }, kind));
  return doc;
}
it("exports every fastener as physical SVG vectors and respects annotation filtering", () => {
  const doc = fixture(),
    before = structuredClone(doc);
  const options = {
    internal: true,
    marks: true,
    metadata: false,
    cut: false,
    stitch: true,
    annotations: true,
  };
  const svg = exportSvg(doc, ["panel"], options);
  for (const id of Object.keys(doc.annotations))
    expect(svg).toContain(`data-annotation="${id}"`);
  expect(svg).toContain('width="');
  expect(svg).toContain('mm"');
  const hole = exportAnnotation(doc.annotations.hole);
  expect(hole.svg).toContain("rotate(90)");
  expect(hole.svg).toContain(" C ");
  expect(hole.svg).not.toContain("<image");
  expect(hole.bounds.max.y - hole.bounds.min.y).toBeCloseTo(30, 9);
  expect(hole.bounds.max.x - hole.bounds.min.x).toBeCloseTo(5, 9);
  expect(
    exportSvg(doc, ["panel"], { ...options, annotations: false }),
  ).not.toContain("data-annotation=");
  expect(doc).toEqual(before);
});
it("uses the same transformed cubic coordinates for PDF and screen geometry", () => {
  const doc = fixture(),
    mark = doc.annotations.hole;
  const drawing = pdfDrawing(doc, ["panel"], defaultPdfLayers, true);
  const curve = annotationShape(mark).curves![0];
  const expected = markCurvePath(
    curve.map((p) =>
      transformMarkPoint(p, mark.position, mark.rotation),
    ) as Cubic,
  );
  expect(drawing.paths).toContainEqual({
    path: expected,
    role: "buttonhole",
    dash: undefined,
  });
  for (const kind of ["button", "buttonhole", "bartack"])
    expect(drawing.paths.some((p) => p.role === kind)).toBe(true);
  expect(drawing.circles).toHaveLength(8);
  expect(
    pdfDrawing(doc, ["panel"], defaultPdfLayers, false).paths.some(
      (p) => p.role === "buttonhole",
    ),
  ).toBe(false);
});
it("writes actual PDF cubic operators with physical millimetre scale", async () => {
  const doc = fixture(),
    before = structuredClone(doc);
  const bytes = await exportPdf(doc, ["panel"], {
    ...defaultPdfLayout,
    mode: "large",
    layers: { ...defaultPdfLayers, metadata: false },
    annotations: true,
  });
  const pdf = await PDFDocument.load(bytes);
  const contents = pdf.getPages()[0].node.Contents();
  const streams =
    contents instanceof PDFArray ? contents.asArray() : [contents];
  const commands = streams
    .map((ref) => {
      const stream = pdf.context.lookup(ref);
      return stream instanceof PDFRawStream
        ? new TextDecoder().decode(decodePDFRawStream(stream).decode())
        : "";
    })
    .join("\n");
  expect(commands).toMatch(/ c\n/);
  expect(commands).toContain(String(PDF_POINTS_PER_MM));
  expect(doc).toEqual(before);
});
