import type { Bounds } from "../geometry/bounds";
import type { PatternDocument } from "../document/schema";
import { itemVisible, pieceForItem } from "../document/pieceAccess";
import { asCubic } from "../document/segments";

export type DrawingItems = { segmentIds: string[]; annotationIds: string[] };
export type ExportScope = "drawing" | "selection" | "all" | "selected";
export function drawingScope(doc: PatternDocument, selected: string[]) {
  const pieces = Object.values(doc.pieces)
    .filter((p) => p.visible)
    .map((p) => p.id);
  const selectedPieces = [
    ...new Set(
      selected.flatMap((id) => {
        const p = doc.pieces[id] ?? pieceForItem(doc, id);
        return p?.visible ? [p.id] : [];
      }),
    ),
  ];
  const loose = Object.keys(doc.segments).filter(
    (id) => !pieceForItem(doc, id),
  );
  const selectedItems = selected.filter(
    (id) => (doc.segments[id] && itemVisible(doc, id)) || doc.annotations[id],
  );
  return {
    pieces,
    selectedPieces,
    loose,
    selectedItems,
    initial: (selectedPieces.length
      ? "selected"
      : loose.length || !pieces.length
        ? "drawing"
        : "all") as ExportScope,
  };
}
export function resolveExportScope(
  doc: PatternDocument,
  selected: string[],
  scope: ExportScope,
  lines: boolean,
) {
  const available = drawingScope(doc, selected);
  const items =
    scope === "selection"
      ? available.selectedItems
      : [...available.loose, ...Object.keys(doc.annotations)];
  const drawing: DrawingItems | undefined =
    scope === "drawing" || scope === "selection"
      ? {
          segmentIds: lines ? items.filter((id) => !!doc.segments[id]) : [],
          annotationIds: items.filter((id) => !!doc.annotations[id]),
        }
      : undefined;
  const pieceIds =
    scope === "selection"
      ? []
      : scope === "selected"
        ? available.selectedPieces
        : available.pieces;
  return {
    pieceIds,
    drawing,
    annotations: scope === "all",
    hasContent: !!(
      pieceIds.length ||
      drawing?.segmentIds.length ||
      drawing?.annotationIds.length ||
      (scope === "all" && Object.keys(doc.annotations).length)
    ),
  };
}
export const emptyExportBounds = (): Bounds => ({
  min: { x: Infinity, y: Infinity },
  max: { x: -Infinity, y: -Infinity },
});
export function includeExportBounds(bounds: Bounds, extra: Bounds) {
  bounds.min.x = Math.min(bounds.min.x, extra.min.x);
  bounds.min.y = Math.min(bounds.min.y, extra.min.y);
  bounds.max.x = Math.max(bounds.max.x, extra.max.x);
  bounds.max.y = Math.max(bounds.max.y, extra.max.y);
}
/** Curved control hulls conservatively bound raw drawing paths without clipping. */
export function drawingSegments(doc: PatternDocument, drawing?: DrawingItems) {
  return [...new Set(drawing?.segmentIds ?? [])].flatMap((id) => {
    const edge = doc.segments[id];
    if (!edge) throw new Error("An export line no longer exists.");
    if (!itemVisible(doc, id)) return [];
    const points = asCubic(doc, edge);
    return [
      {
        edge,
        bounds: {
          min: {
            x: Math.min(...points.map((p) => p.x)),
            y: Math.min(...points.map((p) => p.y)),
          },
          max: {
            x: Math.max(...points.map((p) => p.x)),
            y: Math.max(...points.map((p) => p.y)),
          },
        },
      },
    ];
  });
}
export function drawingAnnotations(
  doc: PatternDocument,
  all: boolean,
  drawing?: DrawingItems,
) {
  return [
    ...new Set([
      ...(all ? Object.keys(doc.annotations) : []),
      ...(drawing?.annotationIds ?? []),
    ]),
  ].map((id) => {
    const mark = doc.annotations[id];
    if (!mark) throw new Error("An export mark no longer exists.");
    return mark;
  });
}
