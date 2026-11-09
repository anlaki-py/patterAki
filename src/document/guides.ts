import { constructionGuideSchema, type ConstructionGuide } from "./guideSchema";
import type { PatternDocument } from "./schema";
export function addGuide(
  doc: PatternDocument,
  axis: ConstructionGuide["axis"],
  positionMm: number,
  id: string,
): PatternDocument {
  if (Object.hasOwn(doc.guides, id))
    throw new Error("Guide ID already exists.");
  if (Object.hasOwn(doc.segments, id) || Object.hasOwn(doc.annotations, id))
    throw new Error("Guide ID conflicts with another document item.");
  const guide = constructionGuideSchema.parse({
    id,
    axis,
    positionMm,
    locked: false,
    visible: true,
  });
  return { ...doc, guides: { ...doc.guides, [id]: guide } };
}
export function updateGuide(
  doc: PatternDocument,
  id: string,
  patch: Partial<Pick<ConstructionGuide, "positionMm" | "locked" | "visible">>,
): PatternDocument {
  const current = doc.guides[id];
  if (!current) throw new Error("This guide no longer exists.");
  const guide = constructionGuideSchema.parse({ ...current, ...patch });
  return { ...doc, guides: { ...doc.guides, [id]: guide } };
}
export function moveGuide(
  doc: PatternDocument,
  id: string,
  positionMm: number,
): PatternDocument {
  return updateGuide(doc, id, { positionMm });
}
export function deleteGuide(doc: PatternDocument, id: string): PatternDocument {
  if (!doc.guides[id]) return doc;
  const guides = { ...doc.guides };
  delete guides[id];
  return { ...doc, guides };
}
