import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from "react";
export function useDialogDrag() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const reset = () => setOffset({ x: 0, y: 0 });
    window.addEventListener("resize", reset);
    return () => window.removeEventListener("resize", reset);
  }, []);
  const drag = useRef<{
    x: number;
    y: number;
    offset: typeof offset;
    bounds: DOMRect;
  } | null>(null);
  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));
  const move = (base: typeof offset, bounds: DOMRect, dx: number, dy: number) =>
    setOffset({
      x: base.x + clamp(dx, -bounds.left, window.innerWidth - bounds.right),
      y:
        base.y +
        clamp(
          dy,
          -bounds.top,
          Math.max(-bounds.top, window.innerHeight - bounds.bottom),
        ),
    });
  return {
    offset,
    handleProps: {
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) return;
        const bounds = event.currentTarget
          .closest('[role="dialog"]')
          ?.getBoundingClientRect();
        if (!bounds) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, y: event.clientY, offset, bounds };
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        const start = drag.current;
        if (start)
          move(
            start.offset,
            start.bounds,
            event.clientX - start.x,
            event.clientY - start.y,
          );
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      },
      onPointerCancel: () => {
        drag.current = null;
      },
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        const directions: Record<string, [number, number]> = {
          ArrowLeft: [-10, 0],
          ArrowRight: [10, 0],
          ArrowUp: [0, -10],
          ArrowDown: [0, 10],
        };
        const delta = directions[event.key],
          bounds = event.currentTarget
            .closest('[role="dialog"]')
            ?.getBoundingClientRect();
        if (delta && bounds) {
          event.preventDefault();
          move(offset, bounds, ...delta);
        }
      },
    },
  };
}
