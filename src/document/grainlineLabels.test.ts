import { beforeEach, expect, it } from "vitest";
import { newAnnotation, putAnnotation } from "./annotations";
import { annotationShape, annotationBounds } from "./annotationGeometry";
import { annotationSchema } from "./annotationSchema";
import { documentSchema, emptyDocument, parseProject } from "./schema";
import { addPath } from "./operations";
import { createPieceFromEdge } from "./pieces";
import { attachAnnotation } from "./sewing";
import { sewingDrawing } from "./sewingDrawing";
import {
  annotationFields,
  commitAnnotation,
  previewAnnotation,
} from "../editor/annotationEdit";
import { useEditor } from "../editor/store";
import { pdfDrawing, defaultPdfLayers } from "../export/pdfDrawing";
import { exportSvg } from "../export/svg";

function grainline() {
  const mark = newAnnotation("grainline", { x: 30, y: 40 }, "grain");
  if (mark.kind !== "grainline") throw new Error("Expected grainline");
  return { ...mark, label: "Grain", lengthMm: 100, rotation: 0 };
}
beforeEach(() => useEditor.getState().load(emptyDocument("labels")));
it.each(["top", "bottom", "inside"] as const)(
  "places a grainline label at %s with both arrowheads intact",
  (labelPosition) => {
    const mark = { ...grainline(), labelPosition };
    const shape = annotationShape(mark),
      text = shape.texts[0];
    expect(text.position.x).toBe((100 - text.width) / 2);
    if (labelPosition === "top")
      expect(text.position.y + text.size * 1.2).toBeLessThan(0);
    if (labelPosition === "bottom") expect(text.position.y).toBeGreaterThan(0);
    if (labelPosition === "inside") {
      expect(text.position.y + text.size * 0.6).toBe(0);
      const shafts = shape.lines.filter(([a, b]) => a.y === 0 && b.y === 0);
      expect(shafts).toHaveLength(2);
      expect(shafts[0][1].x).toBeLessThan(text.position.x);
      expect(shafts[1][0].x).toBeGreaterThan(text.position.x + text.width);
    }
    expect(shape.lines.filter(([a, b]) => a.y !== b.y)).toHaveLength(4);
    const doc = putAnnotation(emptyDocument("labels"), mark);
    expect(parseProject(JSON.stringify(doc))).toEqual(doc);
    const drawing = pdfDrawing(doc, [], defaultPdfLayers, true);
    expect(drawing.texts[0].position).toEqual({
      x: 30 + text.position.x,
      y: 40 + text.position.y + text.size,
    });
    expect(drawing.paths).toHaveLength(shape.lines.length);
    expect(
      exportSvg(doc, [], {
        cut: false,
        stitch: false,
        internal: false,
        marks: true,
        metadata: false,
        annotations: true,
      }),
    ).toContain(`x="${text.position.x}" y="${text.position.y}"`);
  },
);
it("rotates label bounds and handles empty labels and labels wider than a short shaft", () => {
  const mark = {
    ...grainline(),
    labelPosition: "bottom" as const,
    rotation: 90,
  };
  expect(annotationBounds(mark).min.x).toBeLessThan(mark.position.x);
  const empty = annotationShape({
    ...mark,
    label: "",
    labelPosition: "inside",
  });
  expect(empty.texts).toHaveLength(0);
  expect(empty.lines).toHaveLength(5);
  const short = annotationShape({
    ...mark,
    lengthMm: 5,
    labelPosition: "inside",
  });
  expect(short.lines).toHaveLength(4);
});
it("commits placement as one undo step and refuses invalid placement without changing geometry", () => {
  const s = useEditor.getState();
  const session = {
    base: s.document,
    annotation: grainline(),
    revision: s.revision,
    cancelVersion: s.cancelVersion,
  };
  const fields = {
    ...annotationFields(session.annotation, s.document.unitsDisplay),
    labelPosition: "inside" as const,
  };
  const preview = previewAnnotation(session, fields);
  expect(useEditor.getState().document).toEqual(session.base);
  expect(() =>
    commitAnnotation(session, { ...fields, labelPosition: "invalid" as never }),
  ).toThrow();
  expect(useEditor.getState().past).toHaveLength(0);
  commitAnnotation(session, fields);
  expect(useEditor.getState().document).toEqual(preview);
  expect(useEditor.getState().past).toHaveLength(1);
  useEditor.getState().undo();
  expect(useEditor.getState().document).toEqual(session.base);
  useEditor.getState().redo();
  expect(useEditor.getState().document).toEqual(preview);
});
it("migrates v11 without moving marks and rejects unknown or disguised placement fields", () => {
  const old = {
    ...putAnnotation(emptyDocument("old"), grainline()),
    schemaVersion: 11,
  };
  const before = structuredClone(old);
  expect(documentSchema.parse(old)).toEqual({ ...old, schemaVersion: 12 });
  expect(old).toEqual(before);
  expect(
    annotationSchema.safeParse({ ...grainline(), labelPosition: "elsewhere" })
      .success,
  ).toBe(false);
  expect(
    documentSchema.safeParse({
      ...old,
      annotations: { grain: { ...grainline(), labelPosition: "inside" } },
    }).success,
  ).toBe(false);
});
it("retains placement on attachment and exports rotated attached labels with a shaft gap", () => {
  let n = 0;
  let doc = addPath(
    emptyDocument("piece"),
    [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
      { x: 0, y: 200 },
    ],
    true,
    () => `id-${++n}`,
  );
  doc = createPieceFromEdge(doc, Object.keys(doc.segments)[0], "piece");
  doc = putAnnotation(doc, {
    ...grainline(),
    labelPosition: "inside",
    rotation: 45,
  });
  doc = attachAnnotation(doc, "piece", "grain", "attached");
  expect(doc.pieces.piece.sewing!.marks[0].labelPosition).toBe("inside");
  expect(parseProject(JSON.stringify(doc))).toEqual(doc);
  const drawing = sewingDrawing(doc, doc.pieces.piece);
  expect(drawing.find((item) => item.text)?.rotation).toBeCloseTo(45);
  expect(drawing.find((item) => item.path)?.path?.match(/ M /g)).toHaveLength(
    5,
  );
  expect(
    pdfDrawing(doc, ["piece"], defaultPdfLayers, false).texts[0].rotation,
  ).toBeCloseTo(45);
  expect(
    exportSvg(doc, ["piece"], {
      cut: false,
      stitch: true,
      internal: false,
      marks: true,
      metadata: false,
      annotations: false,
    }),
  ).toContain('transform="rotate(45');
  expect(documentSchema.safeParse({ ...doc, schemaVersion: 11 }).success).toBe(
    false,
  );
});
