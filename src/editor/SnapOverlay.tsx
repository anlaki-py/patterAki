import type { Snap, SnapKind } from "../geometry/snapping";

export type SnapOverlayValue = Snap & { kind?: SnapKind };

export function snapKindLabel(kind?: SnapKind) {
  if (!kind) return "";
  return {
    endpoint: "Endpoint",
    intersection: "Intersection",
    "guide-intersection": "Guide intersection",
    midpoint: "Midpoint",
    perpendicular: "Perpendicular",
    "on-edge": "On edge",
    guide: "Guide",
    angle: "45°",
    alignment: "Aligned",
    grid: "Grid",
  }[kind];
}

export function SnapOverlay({
  snap,
  scale,
}: {
  snap: SnapOverlayValue;
  scale: number;
}) {
  const grid = snap.kind === "grid";
  return (
    <g pointerEvents="none" aria-hidden="true">
      {snap.guides?.map((guide, index) => (
        <g key={index}>
          <line
            x1={guide.from.x}
            y1={guide.from.y}
            x2={guide.to.x}
            y2={guide.to.y}
            className="alignment-guide"
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={guide.from.x}
            cy={guide.from.y}
            r={3 / scale}
            className="snap-marker"
          />
        </g>
      ))}
      {grid ? (
        <g className="snap-grid-marker">
          <line
            x1={snap.point.x - 4 / scale}
            x2={snap.point.x + 4 / scale}
            y1={snap.point.y}
            y2={snap.point.y}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={snap.point.x}
            x2={snap.point.x}
            y1={snap.point.y - 4 / scale}
            y2={snap.point.y + 4 / scale}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ) : (
        snap.label && (
          <>
            <circle
              cx={snap.point.x}
              cy={snap.point.y}
              r={6 / scale}
              className="snap-marker"
            />
            <text
              x={snap.point.x + 12 / scale}
              y={snap.point.y + 20 / scale}
              fontSize={12 / scale}
              className="measurement"
            >
              {snap.label}
            </text>
          </>
        )
      )}
    </g>
  );
}
