import { expect, it } from "vitest";
import { copyMarks, pasteMarks } from "./markCopies";
import { emptyDocument, parseProject } from "./schema";
import { newAnnotation, putAnnotation } from "./annotations";
import { addPath } from "./operations";
import type { AnnotationKind } from "./annotationSchema";
const kinds: AnnotationKind[] = [
  "text",
  "arrow",
  "grainline",
  "fold",
  "drill",
  "button",
  "buttonhole",
  "eyelet",
  "snap",
  "bartack",
];
function fixture() {
  let seq = 0;
  return addPath(
    emptyDocument("copies"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    false,
    () => `edge-${++seq}`,
  );
}
it.each(kinds)(
  "copies a %s mark with independent identity and unchanged dimensions",
  (kind) => {
    let mark = {
      ...newAnnotation(kind, { x: 100, y: 50 }, "source"),
      rotation: 30,
    };
    if (mark.kind === "buttonhole")
      mark = { ...mark, style: "keyhole", eyeLengthMm: 6, eyeWidthMm: 5 };
    const doc = putAnnotation(fixture(), mark),
      before = structuredClone(doc);
    const snapshot = copyMarks(doc, ["source"]);
    const result = pasteMarks(doc, snapshot, { x: 10, y: 10 }, () => "copy");
    expect(result.document.annotations.copy).toEqual({
      ...mark,
      id: "copy",
      position: { x: 110, y: 60 },
    });
    expect(result.markIds).toEqual(["copy"]);
    expect(result.document.points).toEqual(doc.points);
    expect(result.document.segments).toEqual(doc.segments);
    expect(result.document.pieces).toEqual(doc.pieces);
    expect(parseProject(JSON.stringify(result.document))).toEqual(
      result.document,
    );
    expect(doc).toEqual(before);
    expect(snapshot[0]).not.toBe(doc.annotations.source);
    expect(snapshot[0].position).not.toBe(doc.annotations.source.position);
  },
);
it("preserves group spacing and deduplicates repeated selections", () => {
  let doc = fixture();
  doc = putAnnotation(doc, newAnnotation("button", { x: 10, y: 20 }, "a"));
  doc = putAnnotation(doc, newAnnotation("buttonhole", { x: 40, y: 70 }, "b"));
  let seq = 0;
  const result = pasteMarks(
    doc,
    copyMarks(doc, ["a", "b", "a"]),
    { x: -5, y: 12 },
    () => `copy-${++seq}`,
  );
  expect(result.markIds).toHaveLength(2);
  expect(result.document.annotations["copy-1"].position).toEqual({
    x: 5,
    y: 32,
  });
  expect(result.document.annotations["copy-2"].position).toEqual({
    x: 35,
    y: 82,
  });
});
it("keeps a clipboard snapshot after the source is changed or deleted", () => {
  const source = newAnnotation("text", { x: 10, y: 20 }, "source"),
    doc = putAnnotation(fixture(), source);
  const snapshot = copyMarks(doc, ["source"]);
  const changed = putAnnotation(doc, {
    ...source,
    rotation: 90,
    position: { x: 500, y: 500 },
  });
  expect(snapshot[0]).toEqual(source);
  expect(snapshot[0]).not.toEqual(changed.annotations.source);
  const result = pasteMarks(fixture(), snapshot, { x: 0, y: 0 }, () => "new");
  expect(result.document.annotations.new).toEqual({ ...source, id: "new" });
});
it("rejects empty, mixed or missing selections and invalid paste inputs", () => {
  const doc = putAnnotation(
    fixture(),
    newAnnotation("button", { x: 20, y: 20 }, "mark"),
  );
  for (const ids of [[], ["missing"], ["mark", Object.keys(doc.segments)[0]]])
    expect(() => copyMarks(doc, ids)).toThrow();
  expect(() => pasteMarks(doc, [], { x: 0, y: 0 }, () => "new")).toThrow(
    /Copy/,
  );
  expect(() =>
    pasteMarks(doc, copyMarks(doc, ["mark"]), { x: NaN, y: 0 }, () => "new"),
  ).toThrow(/finite/);
});
it("preserves all source geometry when a later copy has an ID collision or exceeds the coordinate range", () => {
  let doc = putAnnotation(
    fixture(),
    newAnnotation("button", { x: 100, y: 50 }, "a"),
  );
  doc = putAnnotation(doc, newAnnotation("drill", { x: 1e7 - 10, y: 0 }, "b"));
  const before = structuredClone(doc),
    snapshot = copyMarks(doc, ["a", "b"]);
  let seq = 0;
  expect(() =>
    pasteMarks(doc, snapshot, { x: 0, y: 0 }, () =>
      ++seq === 1 ? "fresh" : Object.keys(doc.points)[0],
    ),
  ).toThrow(/existing/);
  expect(doc).toEqual(before);
  seq = 0;
  expect(() =>
    pasteMarks(doc, snapshot, { x: 20, y: 0 }, () => `fresh-${++seq}`),
  ).toThrow(/coordinate range/);
  expect(doc).toEqual(before);
});
