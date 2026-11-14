import { useEffect, useRef, type RefObject } from "react";
import { autoPanDelta } from "./autoPan";
import { hasOpenShortcutOverlay, isEditingText } from "./command";

type View = { x: number; y: number; scale: number };
export type CanvasPointer = Pick<
  PointerEvent,
  "clientX" | "clientY" | "pointerId" | "pointerType" | "altKey" | "shiftKey"
>;
export function useAutoPan(
  svg: RefObject<SVGSVGElement | null>,
  view: View,
  setView: (view: View) => void,
  enabled: boolean,
  move: (event: CanvasPointer) => void,
) {
  const current = useRef({ view, setView, enabled, move });
  const pointer = useRef<CanvasPointer | null>(null);
  const pending = useRef<CanvasPointer | null>(null);
  useEffect(() => {
    current.current = { view, setView, enabled, move };
    if (pending.current) {
      const event = pending.current;
      pending.current = null;
      if (enabled) move(event);
    }
  });
  useEffect(() => {
    const record = (event: PointerEvent) => {
      pointer.current = event;
    };
    const clear = () => {
      pointer.current = null;
      pending.current = null;
    };
    const release = (event: PointerEvent) => {
      if (event.pointerType === "touch") clear();
    };
    window.addEventListener("pointermove", record);
    window.addEventListener("pointercancel", clear);
    window.addEventListener("pointerup", release);
    window.addEventListener("blur", clear);
    let frame = 0,
      previous = 0;
    const tick = (time: number) => {
      const state = current.current;
      const element = svg.current;
      const event = pointer.current;
      if (
        state.enabled &&
        element &&
        event &&
        !hasOpenShortcutOverlay() &&
        !isEditingText(document.activeElement)
      ) {
        const rect = element.getBoundingClientRect();
        const delta = autoPanDelta(
          { x: event.clientX - rect.left, y: event.clientY - rect.top },
          rect,
          previous ? time - previous : 0,
        );
        if (delta.x || delta.y) {
          pending.current = event;
          state.setView({
            ...state.view,
            x: state.view.x + delta.x,
            y: state.view.y + delta.y,
          });
        }
      }
      previous = time;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", record);
      window.removeEventListener("pointercancel", clear);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("blur", clear);
    };
  }, [svg]);
}
