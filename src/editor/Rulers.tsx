import {
  useEffect,
  useState,
  type CSSProperties,
  type PointerEvent,
  type RefObject,
} from "react";
import { formatLength } from "../document/schema";
import { useEditor } from "./store";
import { mmToRulerPx, rulerTicks } from "./rulerMath";

export const RULER_SIZE = 24;

type View = { x: number; y: number; scale: number };
type GuideAxis = "x" | "y";

function Ruler({
  orientation,
  ticks,
  units,
  length,
}: {
  orientation: "top" | "left";
  ticks: ReturnType<typeof rulerTicks>;
  units: Parameters<typeof formatLength>[1];
  length: number;
}) {
  return (
    <svg
      className={`ruler-svg ruler-${orientation}`}
      width={orientation === "top" ? length : RULER_SIZE}
      height={orientation === "top" ? RULER_SIZE : length}
      aria-hidden="true"
      overflow="hidden"
    >
      {ticks.map((tick) => {
        const label = formatLength(tick.mm, units);
        if (orientation === "top")
          return (
            <g key={`${tick.mm}-${tick.px}`}>
              <line
                x1={tick.px}
                x2={tick.px}
                y1={tick.major ? 14 : 19}
                y2={RULER_SIZE}
                className={tick.major ? "ruler-tick major" : "ruler-tick"}
              />
              {tick.major && (
                <text x={tick.px + 3} y={10} className="ruler-label">
                  {label}
                </text>
              )}
            </g>
          );
        return (
          <g key={`${tick.mm}-${tick.px}`}>
            <line
              x1={tick.major ? 14 : 19}
              x2={RULER_SIZE}
              y1={tick.px}
              y2={tick.px}
              className={tick.major ? "ruler-tick major" : "ruler-tick"}
            />
            {tick.major && (
              <text
                x={10}
                y={tick.px - 3}
                className="ruler-label"
                transform={`rotate(-90 10 ${tick.px - 3})`}
              >
                {label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Rulers are screen-space overlays. The drawing surface underneath keeps the
 * same view translation whether rulers are shown or hidden.
 */
export function Rulers({
  view,
  units,
  width,
  height,
  container,
  onCreate,
}: {
  view: View;
  units: Parameters<typeof formatLength>[1];
  width: number;
  height: number;
  container: RefObject<HTMLDivElement | null>;
  onCreate: (axis: GuideAxis, positionMm: number) => void;
}) {
  const [drag, setDrag] = useState<{
    pointer: number;
    axis: GuideAxis;
  } | null>(null);
  const [preview, setPreview] = useState<{
    axis: GuideAxis;
    positionMm: number;
  } | null>(null);

  const update = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const rect = container.current?.getBoundingClientRect();
    if (!rect) return;
    const positionMm =
      drag.axis === "y"
        ? (event.clientY - rect.top - view.y) / view.scale
        : (event.clientX - rect.left - view.x) / view.scale;
    if (!Number.isFinite(positionMm)) return;
    setPreview({ axis: drag.axis, positionMm });
  };

  useEffect(() => {
    if (!drag) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setDrag(null);
      setPreview(null);
      useEditor.setState({ gestureActive: false });
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [drag]);

  const start = (axis: GuideAxis, event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    useEditor.setState({ gestureActive: true });
    setDrag({ pointer: event.pointerId, axis });
    setPreview(null);
  };

  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const rect = container.current?.getBoundingClientRect();
    const axis = drag.axis;
    const insideDrawing =
      !!rect &&
      event.clientX >= rect.left + RULER_SIZE &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top + RULER_SIZE &&
      event.clientY <= rect.bottom;
    if (insideDrawing) {
      const positionMm =
        axis === "y"
          ? (event.clientY - rect.top - view.y) / view.scale
          : (event.clientX - rect.left - view.x) / view.scale;
      if (Number.isFinite(positionMm)) onCreate(axis, positionMm);
    }
    setDrag(null);
    setPreview(null);
    useEditor.setState({ gestureActive: false });
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      className="ruler-layer"
      style={{ "--ruler-size": `${RULER_SIZE}px` } as CSSProperties}
    >
      <div
        className="ruler ruler-top"
        onPointerDown={(event) => start("y", event)}
        onPointerMove={update}
        onPointerUp={finish}
        onPointerCancel={() => {
          setDrag(null);
          setPreview(null);
          useEditor.setState({ gestureActive: false });
        }}
        aria-label="Horizontal ruler. Drag down to create a horizontal guide."
      >
        <Ruler
          orientation="top"
          ticks={rulerTicks(view.x, view.scale, width)}
          units={units}
          length={width}
        />
      </div>
      <div
        className="ruler ruler-left"
        onPointerDown={(event) => start("x", event)}
        onPointerMove={update}
        onPointerUp={finish}
        onPointerCancel={() => {
          setDrag(null);
          setPreview(null);
          useEditor.setState({ gestureActive: false });
        }}
        aria-label="Vertical ruler. Drag right to create a vertical guide."
      >
        <Ruler
          orientation="left"
          ticks={rulerTicks(view.y, view.scale, height)}
          units={units}
          length={height}
        />
      </div>
      <div className="ruler-corner" aria-hidden="true" />
      {preview && (
        <div
          className={`guide-preview-line ${
            preview.axis === "x" ? "vertical" : "horizontal"
          }`}
          style={
            preview.axis === "x"
              ? { left: mmToRulerPx(preview.positionMm, view.x, view.scale) }
              : { top: mmToRulerPx(preview.positionMm, view.y, view.scale) }
          }
        />
      )}
    </div>
  );
}
