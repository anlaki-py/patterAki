import { bendCurve, moveHandle } from "../document/curves";
import { validateDocumentEdit } from "../document/contourValidation";
import { itemEditable } from "../document/pieceAccess";
import { segmentProjection } from "../document/segments";
import { formatContourIssues } from "../geometry/contourValidation";
import { distance, type Vec2 } from "../geometry/line";
import { useEditor } from "./store";

export function beginCurveDrag(options: {
  edgeId: string;
  handle?: "control1" | "control2";
  point: Vec2;
  pointer: number;
  scale: number;
}) {
  const { edgeId, handle, point: start, pointer, scale } = options;
  const snapshot = useEditor.getState();
  const edge = snapshot.document.segments[edgeId];
  if (
    !edge ||
    snapshot.preview ||
    snapshot.hasDraft ||
    !itemEditable(snapshot.document, edgeId) ||
    (handle && edge.kind !== "cubic")
  )
    return null;
  const t = Math.max(
    0.05,
    Math.min(0.95, segmentProjection(snapshot.document, edge, start)),
  );
  const originalHandle = handle && edge.kind === "cubic" ? edge[handle] : null;
  let ended = false;
  let moved = false;
  const active = () => {
    const s = useEditor.getState();
    return (
      !ended &&
      s.cancelVersion === snapshot.cancelVersion &&
      s.revision === snapshot.revision &&
      s.tool === snapshot.tool
    );
  };
  useEditor.setState({
    selected: [edgeId],
    selectedGuide: null,
    activePoint: handle === "control2" ? edge.to : edge.from,
  });
  const move = (point: Vec2, pointerId: number, alt = false) => {
    if (!active() || pointerId !== pointer) return false;
    const travel = distance(start, point);
    // A click or normal pickup jitter must leave the segment's type intact.
    if (!moved && travel * scale < 3) return true;
    moved = true;
    if (travel < 1e-9) {
      useEditor.setState({ preview: null, previewIssue: null });
      return true;
    }
    const delta = { x: point.x - start.x, y: point.y - start.y };
    const preview =
      handle && originalHandle
        ? moveHandle(
            snapshot.document,
            edgeId,
            handle,
            {
              x: originalHandle.x + delta.x,
              y: originalHandle.y + delta.y,
            },
            alt,
          )
        : bendCurve(snapshot.document, edgeId, t, delta);
    const check = validateDocumentEdit(snapshot.document, preview);
    useEditor.setState({
      preview,
      previewIssue: check.valid ? null : formatContourIssues(check),
    });
    return true;
  };
  return {
    active,
    owns: (pointerId: number) => active() && pointerId === pointer,
    move,
    finish(point: Vec2, pointerId: number, alt = false) {
      try {
        // Release may contain a newer position than the last pointermove.
        if (!move(point, pointerId, alt)) return false;
        ended = true;
        const s = useEditor.getState();
        if (s.previewIssue) throw new Error(s.previewIssue);
        if (s.preview) s.commit(s.preview);
      } catch (error) {
        ended = true;
        useEditor.getState().cancel();
        throw error;
      }
      return true;
    },
  };
}

export type CurveDrag = NonNullable<ReturnType<typeof beginCurveDrag>>;
