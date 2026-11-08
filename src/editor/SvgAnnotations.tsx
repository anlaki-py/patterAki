import type { PatternDocument } from "../document/schema";
import { annotationShape } from "../document/annotationGeometry";
export function SvgAnnotations({
  doc,
  selected,
  scale,
}: {
  doc: PatternDocument;
  selected: string[];
  scale: number;
}) {
  const selection = new Set(selected);
  return (
    <g>
      {Object.values(doc.annotations).map((mark) => {
        const shape = annotationShape(mark);
        return (
          <g
            key={mark.id}
            className={`annotation${selection.has(mark.id) ? " selected" : ""}`}
            data-annotation={mark.id}
            transform={`translate(${mark.position.x} ${mark.position.y}) rotate(${mark.rotation})`}
          >
            <title>
              {mark.kind === "text"
                ? mark.text
                : mark.kind === "drill"
                  ? "Drill point"
                  : mark.label || "Arrow"}
              . Drag to move; double-click to edit.
            </title>
            {shape.lines.map(([a, b], i) => (
              <g key={`line-${i}`}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  className="annotation-stroke"
                  strokeDasharray={
                    mark.kind === "fold" && i === 0 ? "3 2" : undefined
                  }
                />
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="transparent"
                  strokeWidth={Math.max(0.35, 14 / scale)}
                />
              </g>
            ))}
            {shape.circles.map(({ center, radius }, i) => (
              <g key={`circle-${i}`}>
                <circle
                  cx={center.x}
                  cy={center.y}
                  r={radius}
                  className="annotation-stroke"
                  fill="none"
                />
                <circle
                  cx={center.x}
                  cy={center.y}
                  r={Math.max(radius, 7 / scale)}
                  fill="transparent"
                />
              </g>
            ))}
            {shape.texts.map((line, i) => (
              <g key={`text-${i}`}>
                <rect
                  x={line.position.x}
                  y={line.position.y}
                  width={line.width}
                  height={line.size * 1.2}
                  fill="transparent"
                />
                <text
                  x={line.position.x}
                  y={line.position.y + line.size * 0.85}
                  fontSize={line.size}
                  fontFamily="monospace"
                  textLength={line.width}
                  lengthAdjust="spacingAndGlyphs"
                  xmlSpace="preserve"
                  className="annotation-text"
                >
                  {line.text}
                </text>
              </g>
            ))}
          </g>
        );
      })}
    </g>
  );
}
