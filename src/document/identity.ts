import type { PatternDocument } from "./schema";
/** IDs are shared by geometry, pieces, paths and sewing records. */
export function idAllocator(doc: PatternDocument, createId: () => string) {
  const used = new Set([
    ...Object.keys(doc.points),
    ...Object.keys(doc.segments),
    ...Object.keys(doc.annotations),
    ...Object.keys(doc.guides),
    ...Object.keys(doc.pieces),
    ...Object.values(doc.pieces).flatMap((p) =>
      [
        ...p.internalPaths,
        ...(p.sewing?.marks ?? []),
        ...(p.sewing?.darts ?? []),
        ...(p.sewing?.notches ?? []),
      ].map((item) => item.id),
    ),
  ]);
  return () => {
    const id = createId();
    if (!id || used.has(id))
      throw new Error("ID generator returned an existing or empty ID.");
    used.add(id);
    return id;
  };
}
