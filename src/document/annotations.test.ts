import { describe, expect, it } from "vitest";
import { addPath } from "./operations";
import { newAnnotation, putAnnotation } from "./annotations";
import {
  annotationBounds,
  annotationShape,
  annotationTouchesBox,
} from "./annotationGeometry";
import { annotationSchema, type AnnotationKind } from "./annotationSchema";
import { documentSchema, emptyDocument, parseProject } from "./schema";
import { itemsInBox, translateSelection } from "./selection";
import { selectionBounds } from "../geometry/bounds";
function fixture() {
  let i = 0;
  return addPath(
    emptyDocument("test"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    false,
    () => `edge-${++i}`,
  );
}
const kinds: AnnotationKind[] = ["text", "arrow", "grainline", "fold", "drill"];
it.each(kinds)(
  "creates and round-trips a %s annotation without changing geometry",
  (kind) => {
    const doc = fixture(),
      mark = newAnnotation(kind, { x: 20, y: 40 }, "mark");
    const next = putAnnotation(doc, mark);
    expect(next.points).toEqual(doc.points);
    expect(next.segments).toEqual(doc.segments);
    expect(doc.annotations).toEqual({});
    expect(parseProject(JSON.stringify(next))).toEqual(next);
  },
);
it("keeps dimensions in millimetres when changing display units", () => {
  const doc = putAnnotation(
    fixture(),
    newAnnotation("text", { x: 20, y: 40 }, "mark"),
  );
  const next = { ...doc, unitsDisplay: "in" as const };
  expect(annotationBounds(next.annotations.mark)).toEqual(
    annotationBounds(doc.annotations.mark),
  );
  expect(next.annotations).toBe(doc.annotations);
});
it("translates mixed selections by the same delta without moving unselected marks", () => {
  let doc = fixture();
  doc = putAnnotation(doc, newAnnotation("text", { x: 20, y: 40 }, "mark"));
  doc = putAnnotation(doc, newAnnotation("arrow", { x: 90, y: 40 }, "other"));
  const edge = Object.values(doc.segments)[0];
  const next = translateSelection(doc, [edge.id, "mark"], { x: 3.2, y: -7 });
  expect(next.annotations.mark.position).toEqual({ x: 23.2, y: 33 });
  expect(next.points[edge.from]).toEqual({ x: 3.2, y: -7 });
  expect(next.annotations.other).toEqual(doc.annotations.other);
});
it("moves a mark alone without changing fabric vertices or controls", () => {
  const doc = putAnnotation(
    fixture(),
    newAnnotation("grainline", { x: 20, y: 40 }, "mark"),
  );
  const next = translateSelection(doc, ["mark"], { x: 10, y: 20 });
  expect(next.points).toEqual(doc.points);
  expect(next.segments).toEqual(doc.segments);
});
it("selects annotation strokes and rotated text with a crossing box", () => {
  const arrow = {
    ...newAnnotation("arrow", { x: 20, y: 40 }, "arrow"),
    rotation: 90,
  };
  const text = {
    ...newAnnotation("text", { x: 0, y: 0 }, "text"),
    rotation: 90,
  };
  let doc = putAnnotation(fixture(), arrow);
  doc = putAnnotation(doc, text);
  expect(
    itemsInBox(doc, selectionBounds({ x: 19, y: 55 }, { x: 21, y: 56 })),
  ).toEqual(["arrow"]);
  expect(
    annotationTouchesBox(
      text,
      selectionBounds({ x: -2, y: 2 }, { x: -1, y: 3 }),
    ),
  ).toBe(true);
  expect(
    annotationTouchesBox(text, selectionBounds({ x: 5, y: 5 }, { x: 6, y: 6 })),
  ).toBe(false);
});
it("includes both grainline arrowheads and a drill circle/cross in shape geometry", () => {
  expect(
    annotationShape(newAnnotation("grainline", { x: 0, y: 0 }, "grain")).lines,
  ).toHaveLength(5);
  const drill = annotationShape(
    newAnnotation("drill", { x: 0, y: 0 }, "drill"),
  );
  expect(drill.lines).toHaveLength(2);
  expect(drill.circles).toHaveLength(1);
});
it("rejects malformed annotation data and duplicate IDs", () => {
  const doc = fixture(),
    mark = newAnnotation("text", { x: 20, y: 40 }, "mark");
  expect(annotationSchema.safeParse({ ...mark, fontSizeMm: 0 }).success).toBe(
    false,
  );
  expect(annotationSchema.safeParse({ ...mark, text: "   " }).success).toBe(
    false,
  );
  expect(
    annotationSchema.safeParse({ ...mark, rotation: Infinity }).success,
  ).toBe(false);
  expect(annotationSchema.safeParse({ ...mark, kind: "unknown" }).success).toBe(
    false,
  );
  expect(
    documentSchema.safeParse({ ...doc, annotations: { wrong: mark } }).success,
  ).toBe(false);
  expect(() =>
    putAnnotation(doc, { ...mark, id: Object.keys(doc.segments)[0] }),
  ).toThrow("edge");
  expect(
    documentSchema.safeParse({
      ...doc,
      annotations: {
        [Object.keys(doc.segments)[0]]: {
          ...mark,
          id: Object.keys(doc.segments)[0],
        },
      },
    }).success,
  ).toBe(false);
});
it("rejects marks whose visible extent exceeds the coordinate range", () => {
  const mark = newAnnotation("arrow", { x: 1e7 - 1, y: 0 }, "mark");
  expect(() => putAnnotation(fixture(), mark)).toThrow("coordinate range");
  expect(
    documentSchema.safeParse({ ...fixture(), annotations: { mark } }).success,
  ).toBe(false);
});
describe("version migrations", () => {
  it.each([1, 2])(
    "migrates version %s without altering old points or edges",
    (version) => {
      const doc = fixture();
      const legacy = {
        schemaVersion: version,
        id: doc.id,
        name: doc.name,
        points: doc.points,
        segments: doc.segments,
        unitsDisplay: doc.unitsDisplay,
      };
      const copy = structuredClone(legacy);
      expect(parseProject(JSON.stringify(legacy))).toEqual(doc);
      expect(legacy).toEqual(copy);
    },
  );
  it("rejects corrupt legacy geometry, unknown versions and unexpected mark data instead of dropping it", () => {
    const doc = fixture();
    // Version 4 is now a supported legacy format; its valid shape migrates to v5.
    const legacyV4 = {
      schemaVersion: 4,
      id: doc.id,
      name: doc.name,
      points: doc.points,
      segments: doc.segments,
      unitsDisplay: doc.unitsDisplay,
      annotations: doc.annotations,
      guides: doc.guides,
    };
    expect(documentSchema.safeParse(legacyV4).success).toBe(true);
    // V5-only piece data on a V4 document must not be silently discarded.
    expect(documentSchema.safeParse({ ...legacyV4, pieces: {} }).success).toBe(
      false,
    );
    expect(
      documentSchema.safeParse({ ...doc, schemaVersion: 99 }).success,
    ).toBe(false);
    // Even an empty extra field is unsupported in historical formats.
    expect(documentSchema.safeParse({ ...doc, schemaVersion: 2 }).success).toBe(
      false,
    );
    const legacy = {
      schemaVersion: 2,
      id: doc.id,
      name: doc.name,
      points: {},
      segments: doc.segments,
      unitsDisplay: doc.unitsDisplay,
    };
    expect(documentSchema.safeParse(legacy).success).toBe(false);
    expect(
      documentSchema.safeParse({ ...legacy, schemaVersion: 1 }).success,
    ).toBe(false);
  });
});
