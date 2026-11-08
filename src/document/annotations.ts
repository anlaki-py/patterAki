import type { Vec2 } from "../geometry/line";
import {
  annotationSchema,
  type Annotation,
  type AnnotationKind,
} from "./annotationSchema";
import { annotationInRange } from "./annotationGeometry";
import type { PatternDocument } from "./schema";
export function newAnnotation(
  kind: AnnotationKind,
  position: Vec2,
  id: string,
): Annotation {
  const base = { id, position: { ...position }, rotation: 0 };
  if (kind === "text")
    return { ...base, kind, text: "Pattern name\nCut 2", fontSizeMm: 5 };
  if (kind === "drill") return { ...base, kind, sizeMm: 4 };
  return {
    ...base,
    kind,
    lengthMm: 60,
    fontSizeMm: 4,
    rotation: kind === "arrow" ? 0 : 90,
    label:
      kind === "grainline"
        ? "GRAINLINE"
        : kind === "fold"
          ? "PLACE ON FOLD"
          : "",
  };
}
export function putAnnotation(
  doc: PatternDocument,
  input: Annotation,
): PatternDocument {
  const mark = annotationSchema.parse(input);
  if (Object.hasOwn(doc.segments, mark.id))
    throw new Error("This ID already belongs to an edge.");
  if (!annotationInRange(mark))
    throw new Error(
      "Keep the entire mark inside the supported coordinate range.",
    );
  return { ...doc, annotations: { ...doc.annotations, [mark.id]: mark } };
}
export function deleteAnnotations(
  doc: PatternDocument,
  ids: string[],
): PatternDocument {
  const annotations = { ...doc.annotations };
  for (const id of ids) delete annotations[id];
  return { ...doc, annotations };
}
