import { SvgSewing } from "./SvgSewing";
import { roleDash } from "../document/sewingDrawing";
import {
  pieceForItem,
  itemEditable,
  visibleDocument,
} from "../document/pieceAccess";
import { pieceOutlinePath } from "../document/piecePaths";
import { CurveHandles } from "./CurveHandles";
import { segmentPath } from "../document/segments";
import type { PatternDocument } from "../document/schema";

export function SvgGeometry({
  doc,
  selectedIds,
  scale,
  showPoints = false,
  interactivePoints,
  showHandles = false,
  activePoint,
  editPieceId,
}: {
  editPieceId?: string | null;
  activePoint?: string | null;
  doc: PatternDocument;
  selectedIds: string[];
  scale: number;
  // Retained for compatibility with existing viewport call sites.
  showPoints?: boolean;
  interactivePoints?: boolean;
  showHandles?: boolean;
}) {
  const allPieces = Object.values(doc.pieces);
  doc = visibleDocument(doc);
  const selected =
    selectedIds.length === 1 ? doc.segments[selectedIds[0]] : undefined;
  const selection = new Set(selectedIds);
  const visiblePointIds = Object.keys(doc.points);
  const selectedPointIds = selected ? [selected.from, selected.to] : [];
  const selectedPointSet = new Set(selectedPointIds);
  // Older viewport code passes showPoints only for Add point mode; new code
  // explicitly sets interactivePoints for Select and Curve.
  // Group selection moves by its edges; do not expose individual point hit targets.
  // The visual markers still render for every point in every tool.
  const pointHandlesEnabled =
    selectedIds.length <= 1 && (interactivePoints ?? !showPoints);
  return (
    <>
      {allPieces
        .filter((piece) => piece.visible)
        .map((piece) => (
          <path
            key={piece.id}
            data-edge={piece.locked ? undefined : piece.rootSegmentId}
            d={pieceOutlinePath(doc, piece)}
            fill={
              piece.stitchingOutline.every((ref) =>
                selection.has(ref.segmentId),
              )
                ? "var(--mantine-color-blue-light)"
                : "var(--mantine-color-gray-light)"
            }
            stroke="none"
            pointerEvents={
              piece.locked || piece.id === editPieceId ? "none" : "all"
            }
          >
            <title>
              {piece.name}
              {piece.locked ? " · Locked" : " · Select piece"}
            </title>
          </path>
        ))}
      <SvgSewing doc={doc} />
      {Object.values(doc.segments).map((edge) => {
        const parent = pieceForItem(doc, edge.id);
        const path = parent?.internalPaths.find((p) =>
          p.edges.some((r) => r.segmentId === edge.id),
        );
        const setting = path ? parent?.sewing?.paths[path.id] : undefined;
        if (setting?.visible === false) return null;
        const role = path
          ? (setting?.role ?? "construction")
          : (parent?.sewing?.edges[edge.id]?.role ?? "seam");
        return (
          <g
            key={edge.id}
            className={selection.has(edge.id) ? "selected edge" : "edge"}
          >
            <path
              d={segmentPath(doc, edge)}
              fill="none"
              data-role={role}
              strokeDasharray={roleDash(role)}
              className="edge-stroke"
              vectorEffect="non-scaling-stroke"
            />
            <path
              data-edge={itemEditable(doc, edge.id) ? edge.id : undefined}
              className="edge-hit"
              d={segmentPath(doc, edge)}
              fill="none"
              stroke="transparent"
              strokeWidth={18 / scale}
            />
          </g>
        );
      })}
      {visiblePointIds.map((id) => {
        const parent = pieceForItem(doc, id);
        const p = doc.points[id];
        return (
          <g key={id}>
            <circle
              cx={p.x}
              cy={p.y}
              r={3.5 / scale}
              className={
                selectedPointSet.has(id) ? "point point-active" : "point"
              }
              pointerEvents="none"
            />
            {pointHandlesEnabled &&
              itemEditable(doc, id) &&
              (!parent || parent.id === editPieceId) && (
                <circle
                  data-point={id}
                  cx={p.x}
                  cy={p.y}
                  r={12 / scale}
                  fill="transparent"
                  className="point-hit"
                />
              )}
          </g>
        );
      })}
      {selected &&
        itemEditable(doc, selected.id) &&
        (!pieceForItem(doc, selected.id) ||
          pieceForItem(doc, selected.id)?.id === editPieceId) &&
        (showHandles || selected.kind === "cubic") && (
          <CurveHandles
            doc={doc}
            pointIds={activePoint ? [activePoint] : [selected.from]}
            scale={scale}
          />
        )}
    </>
  );
}
