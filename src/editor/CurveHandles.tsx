import type { PatternDocument } from "../document/schema";
import { asCubic } from "../document/segments";
export function CurveHandles({
  doc,
  pointIds,
  scale,
}: {
  doc: PatternDocument;
  pointIds: string[];
  scale: number;
}) {
  return (
    <g>
      {Object.values(doc.segments).flatMap((edge) => {
        const curve = asCubic(doc, edge);
        return (["control1", "control2"] as const).map((handle, index) => {
          const anchorId = index === 0 ? edge.from : edge.to;
          if (!pointIds.includes(anchorId)) return null;
          const anchor = doc.points[anchorId],
            p = curve[index + 1];
          return (
            <g key={`${edge.id}-${handle}`}>
              <line
                x1={anchor.x}
                y1={anchor.y}
                x2={p.x}
                y2={p.y}
                className="curve-arm"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
              <circle
                cx={p.x}
                cy={p.y}
                r={5 / scale}
                className="curve-handle"
                pointerEvents="none"
              />
              <circle
                data-handle={handle}
                data-handle-edge={edge.id}
                cx={p.x}
                cy={p.y}
                r={12 / scale}
                fill="transparent"
                className="point-hit"
              >
                <title>
                  Drag {index === 0 ? "outgoing" : "incoming"} curve arm
                </title>
              </circle>
            </g>
          );
        });
      })}
    </g>
  );
}
