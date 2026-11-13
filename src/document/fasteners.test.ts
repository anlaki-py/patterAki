import { beforeEach, expect, it } from "vitest";
import { newAnnotation, putAnnotation } from "./annotations";
import {
  annotationBounds,
  annotationShape,
  annotationTouchesBox,
} from "./annotationGeometry";
import { annotationSchema, type AnnotationKind } from "./annotationSchema";
import { documentSchema, emptyDocument, parseProject } from "./schema";
import { useEditor } from "../editor/store";
import {
  annotationFields,
  commitAnnotation,
  previewAnnotation,
  type AnnotationSession,
} from "../editor/annotationEdit";
import { cubicPoint } from "../geometry/bezier";

const kinds: AnnotationKind[] = [
  "button",
  "buttonhole",
  "eyelet",
  "snap",
  "bartack",
];
beforeEach(() => useEditor.getState().load(emptyDocument("fasteners")));
it.each(kinds)(
  "round trips a %s mark and preserves fabric geometry",
  (kind) => {
    const doc = emptyDocument("marks"),
      mark = newAnnotation(kind, { x: 50, y: 60 }, "mark");
    const next = putAnnotation(doc, mark);
    expect(parseProject(JSON.stringify(next))).toEqual(next);
    expect(next.points).toEqual(doc.points);
    expect(next.segments).toEqual(doc.segments);
    expect(doc.annotations).toEqual({});
  },
);
it.each(["none", "two", "four"] as const)(
  "draws an accurately sized oval button with %s holes",
  (holes) => {
    const mark = newAnnotation("button", { x: 0, y: 0 }, "mark");
    if (mark.kind !== "button") throw new Error("Expected button");
    const button = { ...mark, widthMm: 24, heightMm: 16, holes };
    const bounds = annotationBounds(button),
      shape = annotationShape(button);
    expect(bounds.min.x).toBeCloseTo(-12, 9);
    expect(bounds.max.x).toBeCloseTo(12, 9);
    expect(bounds.max.y - bounds.min.y).toBeCloseTo(16, 9);
    expect(shape.circles).toHaveLength(
      holes === "none" ? 0 : holes === "two" ? 2 : 4,
    );
    for (const curve of shape.curves!)
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const p = cubicPoint(curve, t);
        expect(Math.abs((p.x / 12) ** 2 + (p.y / 8) ** 2 - 1)).toBeLessThan(
          0.00001,
        );
      }
    expect(
      annotationShape({ ...button, shape: "rectangle" }).lines,
    ).toHaveLength(holes === "none" ? 6 : 4);
  },
);
it.each(["straight", "rounded", "keyhole"] as const)(
  "preserves exact overall dimensions for a %s buttonhole",
  (style) => {
    const mark = newAnnotation("buttonhole", { x: 0, y: 0 }, "mark");
    if (mark.kind !== "buttonhole") throw new Error("Expected buttonhole");
    const hole = {
      ...mark,
      style,
      lengthMm: 30,
      widthMm: 2,
      eyeLengthMm: 6,
      eyeWidthMm: 5,
    };
    const bounds = annotationBounds(hole),
      shape = annotationShape(hole);
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(30, 9);
    expect(bounds.max.y - bounds.min.y).toBeCloseTo(
      style === "keyhole" ? 5 : 2,
      9,
    );
    if (style === "keyhole") {
      const curves = shape.curves!;
      expect(curves[0][0].x).toBeCloseTo(shape.lines.at(-1)![1].x, 9);
      expect(curves[0][0].y).toBeCloseTo(1, 9);
      expect(curves.at(-1)![3].x).toBeCloseTo(shape.lines[0][0].x, 9);
      expect(curves.at(-1)![3].y).toBeCloseTo(-1, 9);
      expect(Math.min(...curves.flat().map((p) => p.x))).toBeCloseTo(-15, 9);
    }
  },
);
it("selects rotated curved mark strokes without selecting their empty bounding-box corners", () => {
  const mark = {
    ...newAnnotation("button", { x: 50, y: 50 }, "mark"),
    rotation: 90,
  };
  expect(
    annotationTouchesBox(mark, {
      min: { x: 49, y: 57 },
      max: { x: 51, y: 58 },
    }),
  ).toBe(true);
  expect(
    annotationTouchesBox(mark, {
      min: { x: 56, y: 56 },
      max: { x: 57, y: 57 },
    }),
  ).toBe(false);
});
it("rejects impossible dimensions and unknown variants at the schema boundary", () => {
  const button = newAnnotation("button", { x: 0, y: 0 }, "mark");
  for (const patch of [
    { widthMm: 0 },
    { heightMm: Infinity },
    { holes: "five" },
    { holeSpacingMm: 100 },
    { shape: "triangle" },
  ])
    expect(annotationSchema.safeParse({ ...button, ...patch }).success).toBe(
      false,
    );
  const hole = newAnnotation("buttonhole", { x: 0, y: 0 }, "mark");
  for (const patch of [
    { lengthMm: 1 },
    { widthMm: -1 },
    { style: "unknown" },
    { style: "keyhole", eyeWidthMm: 1 },
    { style: "keyhole", eyeLengthMm: 20 },
  ])
    expect(annotationSchema.safeParse({ ...hole, ...patch }).success).toBe(
      false,
    );
  expect(
    annotationSchema.safeParse({
      ...newAnnotation("eyelet", { x: 0, y: 0 }, "mark"),
      openingMm: 10,
    }).success,
  ).toBe(false);
  expect(
    annotationSchema.safeParse({
      ...newAnnotation("bartack", { x: 0, y: 0 }, "mark"),
      stitches: 2.5,
    }).success,
  ).toBe(false);
});
it("migrates schema 10 without modifying old marks and refuses new marks disguised as legacy data", () => {
  const old = {
    ...putAnnotation(
      emptyDocument("legacy"),
      newAnnotation("drill", { x: 50, y: 50 }, "old"),
    ),
    schemaVersion: 10,
  };
  const before = structuredClone(old);
  expect(documentSchema.parse(old)).toEqual({ ...old, schemaVersion: 11 });
  expect(old).toEqual(before);
  expect(
    documentSchema.safeParse({
      ...old,
      annotations: { mark: newAnnotation("button", { x: 0, y: 0 }, "mark") },
    }).success,
  ).toBe(false);
  expect(documentSchema.safeParse({ ...old, schemaVersion: 12 }).success).toBe(
    false,
  );
});
it.each(["mm", "cm", "in"] as const)(
  "previews and commits dimensions in %s with one undo entry",
  (unitsDisplay) => {
    useEditor.getState().load({ ...emptyDocument("units"), unitsDisplay });
    const s = useEditor.getState(),
      edit: AnnotationSession = {
        base: s.document,
        annotation: newAnnotation("buttonhole", { x: 20, y: 40 }, "mark"),
        revision: s.revision,
        cancelVersion: s.cancelVersion,
      };
    const fields = annotationFields(edit.annotation, unitsDisplay);
    fields.fastener!.style = "keyhole";
    fields.rotation = 45;
    const preview = previewAnnotation(edit, fields);
    expect(preview.annotations.mark).toMatchObject({
      style: "keyhole",
      lengthMm: 20,
      widthMm: 1.5,
      eyeLengthMm: 4,
      eyeWidthMm: 4,
      rotation: 45,
    });
    expect(s.document.annotations).toEqual({});
    expect(s.past).toHaveLength(0);
    commitAnnotation(edit, fields);
    expect(useEditor.getState().past).toHaveLength(1);
    useEditor.getState().undo();
    expect(useEditor.getState().document).toEqual(edit.base);
    useEditor.getState().redo();
    expect(useEditor.getState().document).toEqual(preview);
  },
);
it("invalid and stale mark edits preserve the document and history", () => {
  const s = useEditor.getState(),
    edit: AnnotationSession = {
      base: s.document,
      annotation: newAnnotation("button", { x: 0, y: 0 }, "mark"),
      revision: s.revision,
      cancelVersion: s.cancelVersion,
    };
  const fields = annotationFields(edit.annotation, "cm");
  for (const width of ["", NaN, Infinity, 0, -1]) {
    fields.fastener!.width = width;
    expect(() => commitAnnotation(edit, fields)).toThrow();
    expect(useEditor.getState().document).toEqual(edit.base);
    expect(useEditor.getState().past).toHaveLength(0);
  }
  useEditor.getState().cancel();
  expect(() =>
    commitAnnotation(edit, annotationFields(edit.annotation, "cm")),
  ).toThrow(/changed/);
});
it("checks curved mark extents and identity collisions on import", () => {
  const mark = {
    ...newAnnotation("button", { x: 1e7, y: 0 }, "mark"),
    rotation: 45,
  };
  expect(() => putAnnotation(emptyDocument("range"), mark)).toThrow(/range/);
  const doc = emptyDocument("ids");
  expect(
    documentSchema.safeParse({
      ...doc,
      annotations: { wrong: newAnnotation("button", { x: 0, y: 0 }, "mark") },
    }).success,
  ).toBe(false);
});

it("accepts a tiny valid button near the coordinate boundary", () => {
  const button = newAnnotation("button", { x: 1e7 - 0.1, y: 0 }, "tiny");
  if (button.kind !== "button") throw new Error("Expected button");
  const mark = {
    ...button,
    holes: "none" as const,
    widthMm: 0.1,
    heightMm: 0.1,
  };
  expect(
    documentSchema.parse(putAnnotation(emptyDocument("boundary"), mark))
      .annotations.tiny,
  ).toEqual(mark);
});
