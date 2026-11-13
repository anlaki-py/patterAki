import { annotationSchema, type Annotation } from "./annotationSchema";
import { annotationInRange } from "./annotationGeometry";
import { putAnnotation } from "./annotations";
import { idAllocator } from "./identity";
import { documentSchema, type PatternDocument } from "./schema";
import type { Vec2 } from "../geometry/line";

/** Copy values rather than references so later edits/deletion cannot change the clipboard. */
export function copyMarks(doc: PatternDocument, ids: string[]): Annotation[] {
  if (!ids.length) throw new Error("Select one or more marks to copy.");
  return [...new Set(ids)].map((id) => {
    const mark = doc.annotations[id];
    if (!mark) throw new Error("Select only marks to copy or duplicate.");
    return annotationSchema.parse(mark);
  });
}

export function pasteMarks(
  doc: PatternDocument,
  marks: readonly Annotation[],
  delta: Vec2,
  createId: () => string,
): { document: PatternDocument; markIds: string[] } {
  if (!marks.length) throw new Error("Copy a mark before pasting.");
  if (![delta.x, delta.y].every(Number.isFinite))
    throw new Error("Paste distances must be finite.");
  const allocate = idAllocator(doc, createId),
    markIds: string[] = [];
  let next = doc;
  for (const source of marks) {
    const mark = annotationSchema.parse(source);
    const placed = {
      ...mark,
      id: allocate(),
      position: {
        x: mark.position.x + delta.x,
        y: mark.position.y + delta.y,
      },
    };
    if (!annotationInRange(placed))
      throw new Error(
        "Keep copied marks inside the supported coordinate range.",
      );
    next = putAnnotation(next, placed);
    markIds.push(placed.id);
  }
  return { document: documentSchema.parse(next), markIds };
}
