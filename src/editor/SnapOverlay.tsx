import type { Snap } from "../geometry/snapping";
export function SnapOverlay({ snap, scale }: { snap: Snap; scale: number }) {
  return (
    <g pointerEvents="none">
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
      {snap.label && (
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
      )}
    </g>
  );
}
