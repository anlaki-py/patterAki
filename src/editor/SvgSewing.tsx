import type { PatternDocument } from "../document/schema";
import { roleDash, sewingDrawing } from "../document/sewingDrawing";
export function SvgSewing({ doc }: { doc: PatternDocument }) {
  return (
    <g pointerEvents="none" className="sewing-marks">
      {Object.values(doc.pieces)
        .filter((p) => p.visible)
        .flatMap((p) =>
          sewingDrawing(doc, p).map((item) =>
            item.path ? (
              <path
                key={item.id}
                data-sewing={item.id}
                d={item.path}
                fill="none"
                stroke="var(--draft-line)"
                strokeWidth={0.4}
                strokeDasharray={roleDash(item.role)}
              />
            ) : (
              <text
                key={item.id}
                x={item.x}
                y={item.y}
                fontSize={item.fontSize ?? 3}
                fill="var(--draft-line)"
              >
                {item.text}
              </text>
            ),
          ),
        )}
    </g>
  );
}
