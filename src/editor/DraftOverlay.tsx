import type { Vec2 } from "../geometry/line";
import { angle, distance } from "../geometry/line";
import { formatLength, type PatternDocument } from "../document/schema";

export function DraftOverlay({
  draft,
  tangents,
  end,
  rectangle,
  scale,
  units,
  focusExact,
}: {
  draft: Vec2[];
  tangents?: ReadonlyMap<number, Vec2>;
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
      <path
        d={[...draft, end]
          .map((p, i, all) => {
            if (!i) return `M ${p.x} ${p.y}`;
            const a = all[i - 1],
              t = tangents?.get(i - 1),
              u = tangents?.get(i);
            if (!t && !u) return `L ${p.x} ${p.y}`;
            const c = t
              ? { x: a.x + t.x, y: a.y + t.y }
              : { x: a.x + (p.x - a.x) / 3, y: a.y + (p.y - a.y) / 3 };
            const d = u
              ? { x: p.x - u.x, y: p.y - u.y }
              : { x: p.x - (p.x - a.x) / 3, y: p.y - (p.y - a.y) / 3 };
            return `C ${c.x} ${c.y} ${d.x} ${d.y} ${p.x} ${p.y}`;
          })
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
