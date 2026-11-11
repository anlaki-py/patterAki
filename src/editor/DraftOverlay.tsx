import type { Vec2 } from "../geometry/line";
import { angle, distance } from "../geometry/line";
import { formatLength, type PatternDocument } from "../document/schema";

export function DraftOverlay({
  draft,
  end,
  rectangle,
  scale,
  units,
  focusExact,
}: {
  draft: Vec2[];
  end: Vec2;
  rectangle?: { width: number; height: number } | null;
  scale: number;
  units: PatternDocument["unitsDisplay"];
  focusExact: () => void;
}) {
  const origin = draft.at(-1);
  if (!origin) return null;
  if (rectangle !== undefined)
    return (
      rectangle && (
        <>
          <rect
            x={origin.x}
            y={origin.y}
            width={rectangle.width}
            height={rectangle.height}
            className="draft-line"
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
          <text
            className="measurement"
            pointerEvents="none"
            x={origin.x + rectangle.width}
            y={origin.y + rectangle.height + 20 / scale}
            fontSize={12 / scale}
          >
            {formatLength(rectangle.width, units)} ×{" "}
            {formatLength(rectangle.height, units)}
          </text>
        </>
      )
    );
  return (
    <>
      <polyline
        points={[...draft, end]
          .map((point) => `${point.x},${point.y}`)
          .join(" ")}
        className="draft-line"
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={(origin.x + end.x) / 2}
        y={(origin.y + end.y) / 2 - 24 / scale}
        fontSize={12 / scale}
        className="measurement dimension-label"
        role="button"
        tabIndex={0}
        data-draft-dimension
        onPointerDown={(event) => event.stopPropagation()}
        onClick={focusExact}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.stopPropagation();
            focusExact();
          }
        }}
      >
        {formatLength(distance(origin, end), units)} ·{" "}
        {angle(origin, end).toFixed(1)}°
      </text>
    </>
  );
}
