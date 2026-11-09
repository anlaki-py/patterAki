import type { PatternDocument } from "../document/schema";

type View = { x: number; y: number; scale: number };

export function GuideOverlay({
  doc,
  view,
  selectedGuide,
  interactive,
  preview,
}: {
  doc: PatternDocument;
  view: View;
  selectedGuide: string | null;
  /** `all` requires explicit guide-edit mode so geometry stays clickable. */
  interactive: "none" | "selected" | "all";
  preview?: { axis: "x" | "y"; positionMm: number } | null;
}) {
  const guides = Object.values(doc.guides)
    .filter((guide) => guide.visible)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return (
    <g pointerEvents="none" aria-label="Construction guides">
      {guides.map((guide) => {
        const selected = guide.id === selectedGuide;
        const position =
          guide.axis === "x"
            ? view.x + guide.positionMm * view.scale
            : view.y + guide.positionMm * view.scale;
        const hit =
          interactive === "all" || (interactive === "selected" && selected);
        return (
          <g key={guide.id}>
            <line
              x1={guide.axis === "x" ? position : "0%"}
              x2={guide.axis === "x" ? position : "100%"}
              y1={guide.axis === "y" ? position : "0%"}
              y2={guide.axis === "y" ? position : "100%"}
              className={`construction-guide${selected ? " selected" : ""}${
                guide.locked ? " locked" : ""
              }`}
              vectorEffect="non-scaling-stroke"
            />
            {hit && (
              <line
                data-guide={guide.id}
                x1={guide.axis === "x" ? position : "0%"}
                x2={guide.axis === "x" ? position : "100%"}
                y1={guide.axis === "y" ? position : "0%"}
                y2={guide.axis === "y" ? position : "100%"}
                stroke="transparent"
                strokeWidth={12}
                pointerEvents="stroke"
                style={{
                  cursor: guide.locked
                    ? "not-allowed"
                    : guide.axis === "x"
                      ? "ew-resize"
                      : "ns-resize",
                }}
              />
            )}
          </g>
        );
      })}
      {preview && (
        <line
          x1={
            preview.axis === "x"
              ? view.x + preview.positionMm * view.scale
              : "0%"
          }
          x2={
            preview.axis === "x"
              ? view.x + preview.positionMm * view.scale
              : "100%"
          }
          y1={
            preview.axis === "y"
              ? view.y + preview.positionMm * view.scale
              : "0%"
          }
          y2={
            preview.axis === "y"
              ? view.y + preview.positionMm * view.scale
              : "100%"
          }
          className="guide-preview-line"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  );
}
