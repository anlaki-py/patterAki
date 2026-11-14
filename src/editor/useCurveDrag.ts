import { useRef } from "react";
import { notifications } from "@mantine/notifications";
import { beginCurveDrag, type CurveDrag } from "./curveDrag";
import type { Vec2 } from "../geometry/line";
import { useEditor } from "./store";

export function useCurveDrag(scale: number) {
  const drag = useRef<CurveDrag | null>(null);
  const report = (error: unknown) => {
    drag.current = null;
    notifications.show({
      color: "red",
      message: `Curve edit cancelled. ${error instanceof Error ? error.message : "The curve could not be edited."}`,
    });
  };
  return {
    begin(target: SVGElement, point: Vec2, pointer: number) {
      if (drag.current?.active()) return false;
      const s = useEditor.getState();
      const handle = target.dataset.handle;
      const edgeId =
        target.dataset.handleEdge ??
        (s.tool === "curve" ? target.dataset.edge : undefined);
      if (!edgeId) return false;
      drag.current = beginCurveDrag({
        edgeId,
        handle:
          handle === "control1" || handle === "control2" ? handle : undefined,
        point,
        pointer,
        scale,
      });
      return !!drag.current;
    },
    move(point: Vec2, pointer: number, alt = false) {
      try {
        return drag.current?.move(point, pointer, alt) ?? false;
      } catch (error) {
        useEditor.getState().cancel();
        report(error);
        return true;
      }
    },
    finish(point: Vec2, pointer: number, alt = false) {
      try {
        if (drag.current?.finish(point, pointer, alt)) drag.current = null;
      } catch (error) {
        report(error);
      }
    },
    active: () => drag.current?.active() ?? false,
    owns: (pointer: number) => drag.current?.owns(pointer) ?? false,
  };
}
