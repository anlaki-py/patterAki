import { memo } from "react";
import { preparedGeometry } from "./preparedGeometry";
import { edgeAllowance } from "../document/sewing";
import { formatLength } from "../document/schema";
import { segmentPoint } from "../document/segments";
import { useEditor } from "./store";
import { SvgSewing } from "./SvgSewing";
import { roleDash } from "../document/sewingDrawing";
import { CurveHandles } from "./CurveHandles";
import type { PatternDocument } from "../document/schema";

export const SvgGeometry = memo(function SvgGeometry({
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
  const mode = useEditor((s) => s.outlineVisibility);
  const previewing = useEditor((s) => !!s.preview);
  const geometry = preparedGeometry(doc);
  doc = geometry.doc;
  const editable = (id: string) => {
    const parent = geometry.owners.get(id);
    return !parent || (parent.visible && !parent.locked);
  };
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
      {geometry.pieces.map(({ piece, outline }) => (
        <path
          key={piece.id}
          data-edge={piece.locked ? undefined : piece.rootSegmentId}
          d={outline}
          fill={
            piece.stitchingOutline.every((ref) => selection.has(ref.segmentId))
              ? "var(--mantine-color-blue-light)"
              : "var(--mantine-color-gray-light)"
          }
          stroke="none"
          pointerEvents={
            piece.locked || piece.id === editPieceId ? "none" : "all"
          }
        >
          <title>{`${piece.name}${piece.locked ? " · Locked" : " · Select piece"}`}</title>
        </path>
      ))}
      {mode !== "stitch" &&
        geometry.pieces.map(({ piece }) => {
          const cut = geometry.cut(piece.id);
          if (!cut) return null;
          const ref =
            piece.stitchingOutline.find((r) => selection.has(r.segmentId)) ??
            piece.stitchingOutline[0];
          const midpoint = segmentPoint(doc, doc.segments[ref.segmentId], 0.5);
          return (
            <g key={`cut-${piece.id}`}>
              <path
                data-cut={piece.id}
                d={cut}
                fill="none"
                stroke="var(--mantine-color-orange-7)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
              {previewing &&
                piece.seamAllowance &&
                piece.stitchingOutline.some((r) =>
                  selection.has(r.segmentId),
                ) && (
                  <text
                    data-seam-width={piece.id}
                    x={midpoint.x}
                    y={midpoint.y - 14 / scale}
                    fontSize={12 / scale}
                    fill="var(--mantine-color-orange-7)"
                    pointerEvents="none"
                  >
                    Allowance{" "}
                    {formatLength(
                      edgeAllowance(
                        piece,
                        ref.segmentId,
                        piece.seamAllowance.widthMm,
                      ),
                      doc.unitsDisplay,
                    )}
                  </text>
                )}
            </g>
          );
        })}
      <SvgSewing doc={doc} />
      {Object.values(doc.segments).map((edge) => {
        const parent = geometry.owners.get(edge.id);
        const path = geometry.internalPaths.get(edge.id);
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
              d={geometry.paths.get(edge.id)}
              fill="none"
              data-role={role}
              strokeDasharray={roleDash(role)}
              className="edge-stroke"
              visibility={
                parent && !path && mode === "cut" && parent.id !== editPieceId
                  ? "hidden"
                  : undefined
              }
              vectorEffect="non-scaling-stroke"
            />
            <path
              data-edge={editable(edge.id) ? edge.id : undefined}
              className="edge-hit"
              d={geometry.paths.get(edge.id)}
              fill="none"
              stroke="transparent"
              strokeWidth={18 / scale}
            />
          </g>
        );
      })}
      {visiblePointIds.map((id) => {
        const parent = geometry.owners.get(id);
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
              visibility={
                parent &&
                parent.id !== editPieceId &&
                mode === "cut" &&
                geometry.outlinePoints.has(id)
                  ? "hidden"
                  : undefined
              }
            />
            {pointHandlesEnabled &&
              editable(id) &&
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
        editable(selected.id) &&
        (!geometry.owners.get(selected.id) ||
          geometry.owners.get(selected.id)?.id === editPieceId) &&
        (showHandles || selected.kind === "cubic") && (
          <CurveHandles
            doc={doc}
            pointIds={activePoint ? [activePoint] : [selected.from]}
            scale={scale}
          />
        )}
    </>
  );
});
