import { useEffect, useRef } from "react";
import { notifications } from "@mantine/notifications";
import { bendCurve, convertToCurve, moveHandle } from "../document/curves";
import { validateDocumentEdit } from "../document/contourValidation";
import { segmentProjection } from "../document/segments";
import type { PatternDocument } from "../document/schema";
import { formatContourIssues } from "../geometry/contourValidation";
import type { Vec2 } from "../geometry/line";
import { useEditor } from "./store";
type CurveDrag = {
  pointer: number;
  edgeId: string;
  handle?: "control1" | "control2";
  start: Vec2;
  t: number;
  base: PatternDocument;
};
export function useCurveDrag() {
  const drag = useRef<CurveDrag | null>(null);
  const cancelVersion = useEditor((s) => s.cancelVersion);
  useEffect(() => {
    drag.current = null;
  }, [cancelVersion]);
  const begin = (target: SVGElement, point: Vec2, pointer: number) => {
    const s = useEditor.getState(),
      handle = target.dataset.handle,
      edgeId =
        target.dataset.handleEdge ??
        (s.tool === "curve" ? target.dataset.edge : undefined);
    if (!edgeId || !s.document.segments[edgeId]) return false;
    const t = segmentProjection(s.document, s.document.segments[edgeId], point);
    drag.current = {
      pointer,
      edgeId,
      handle:
        handle === "control1" || handle === "control2" ? handle : undefined,
      start: point,
      t: Math.max(0.05, Math.min(0.95, t)),
      base: s.document,
    };
    useEditor.setState({
      selected: [edgeId],
      preview: convertToCurve(s.document, edgeId),
      previewIssue: null,
    });
    return true;
  };
  const move = (point: Vec2, pointer: number) => {
    const d = drag.current;
    if (!d || d.pointer !== pointer) return false;
    const preview = d.handle
      ? moveHandle(d.base, d.edgeId, d.handle, point)
      : bendCurve(d.base, d.edgeId, d.t, {
          x: point.x - d.start.x,
          y: point.y - d.start.y,
        });
    const check = validateDocumentEdit(d.base, preview);
    useEditor.setState({
      preview,
      previewIssue: check.valid ? null : formatContourIssues(check),
    });
    return true;
  };
  const finish = (pointer: number) => {
    const d = drag.current;
    if (!d || d.pointer !== pointer) return;
    drag.current = null;
    const s = useEditor.getState();
    if (s.previewIssue) {
      const message = s.previewIssue;
      s.cancel();
      notifications.show({
        color: "red",
        message: `Curve edit cancelled. ${message}`,
      });
      return;
    }
    try {
      if (s.preview) s.commit(s.preview);
    } catch {
      s.cancel();
      notifications.show({
        color: "red",
        message:
          "Curve coordinates are outside the supported range. Edit cancelled.",
      });
    }
  };
  return { begin, move, finish };
}
