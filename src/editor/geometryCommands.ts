import { itemEditable } from "../document/pieceAccess";
import { setPointMode } from "../document/curves";
import { parseLength } from "../document/lengthInput";
import { defineCommand } from "./command";
import { executeEdgeActions } from "./edgeActions";
import { deleteActivePoint, deleteSelection } from "./selectionActions";
import { useEditor } from "./store";
import { changeLength } from "../document/operations";
import {
  assertValidDocumentEdit,
  validateDocumentEdit,
} from "../document/contourValidation";
import { formatContourIssues } from "../geometry/contourValidation";
import {
  closedCycleForEdge,
  createPieceFromEdge,
  expandPieceSelection,
  pieceForEdge,
} from "../document/pieces";
import {
  applyPointPlacement,
  placementOnEdge,
} from "../document/pointPlacement";
import { createId } from "./ids";
import type { Anchor } from "../geometry/line";
import type { PatternDocument } from "../document/schema";

const selectedEdges = () => {
  const s = useEditor.getState();
  return s.selected.filter((id) => !!s.document.segments[id]);
};
function edgeCommand(
  action: "curve" | "reset" | "intersections",
  label: string,
) {
  return defineCommand(
    `edge.${action}`,
    label,
    () => {
      const selected = useEditor.getState().selected;
      const message = executeEdgeActions(selectedEdges(), action);
      useEditor.getState().cancel();
      const doc = useEditor.getState().document;
      useEditor.setState({
        selected: selected.filter(
          (id) => doc.segments[id] || doc.annotations[id],
        ),
      });
      return message;
    },
    () => {
      const s = useEditor.getState(),
        ids = selectedEdges();
      if (ids.some((id) => !itemEditable(s.document, id))) return false;
      if (action === "intersections")
        return s.selected.length === 1 && ids.length === 1;
      return ids.some(
        (id) =>
          s.document.segments[id].kind ===
          (action === "reset" ? "cubic" : "line"),
      );
    },
  );
}
const singleLine = () => {
  const s = useEditor.getState();
  return (
    s.selected.length === 1 &&
    itemEditable(s.document, s.selected[0]) &&
    s.document.segments[s.selected[0]]?.kind === "line"
  );
};
export const geometryCommands = {
  pointMode: defineCommand<"corner" | "smooth" | "symmetric">(
    "point.mode",
    "Point mode",
    (mode) => {
      const s = useEditor.getState();
      s.commit(
        assertValidDocumentEdit(
          s.document,
          setPointMode(s.document, s.activePoint!, mode),
        ),
      );
    },
    () => {
      const s = useEditor.getState();
      return (
        !!s.activePoint && itemEditable(s.document, s.activePoint) && !s.preview
      );
    },
  ),
  curve: edgeCommand("curve", "Convert to curve"),
  reset: edgeCommand("reset", "Convert to straight / remove handles"),
  intersections: edgeCommand("intersections", "Create points at intersections"),
  createPiece: defineCommand<string | { edgeId: string; name: string }>(
    "piece.create-from-contour",
    "Create pattern piece from closed contour",
    (context) => {
      const edgeId = typeof context === "string" ? context : context.edgeId;
      const name = typeof context === "string" ? undefined : context.name;
      const s = useEditor.getState();
      const next = createPieceFromEdge(s.document, edgeId, createId(), name);
      s.commit(next);
      useEditor.setState({
        tool: "select",
        editPieceId: null,
        selected: expandPieceSelection(next, [edgeId]),
        selectedGuide: null,
        activePoint: null,
      });
    },
    (context) => {
      const edgeId = typeof context === "string" ? context : context.edgeId;
      const s = useEditor.getState();
      return (
        !s.preview &&
        !s.hasDraft &&
        !s.gestureActive &&
        !!closedCycleForEdge(s.document, edgeId) &&
        !pieceForEdge(s.document, edgeId)
      );
    },
  ),
  delete: defineCommand(
    "delete",
    "Delete selection",
    () => {
      const s = useEditor.getState();
      if (s.selected.length) deleteSelection(s.selected);
      else if (s.activePoint) deleteActivePoint(s.activePoint);
    },
    () => {
      const s = useEditor.getState();
      return (
        !s.hasDraft &&
        !s.preview &&
        !s.gestureActive &&
        (s.selected.length > 0 || !!s.activePoint) &&
        s.selected.every((id) => itemEditable(s.document, id)) &&
        (!s.activePoint || itemEditable(s.document, s.activePoint))
      );
    },
    [{ key: "Delete" }, { key: "Backspace" }],
  ),
  rename: defineCommand<string>(
    "project.rename",
    "Project name",
    (name) => {
      const s = useEditor.getState();
      s.commit({ ...s.document, name });
    },
    (name) => !!name.trim() && name.length <= 120,
  ),
  units: defineCommand<PatternDocument["unitsDisplay"]>(
    "view.units",
    "Display units",
    (unitsDisplay) => {
      const s = useEditor.getState();
      s.commit({ ...s.document, unitsDisplay });
    },
  ),
  previewLength: defineCommand<{
    value: string | number;
    factor: number;
    anchor: Anchor;
  }>(
    "edge.preview-length",
    "Preview length",
    ({ value, factor, anchor }) => {
      const s = useEditor.getState();
      const next = changeLength(
        s.document,
        s.selected[0],
        parseLength(value, factor),
        anchor,
      );
      const check = validateDocumentEdit(s.document, next);
      useEditor.setState({
        preview: next,
        previewIssue: check.valid ? null : formatContourIssues(check),
      });
    },
    singleLine,
  ),
  applyLength: defineCommand(
    "edge.apply-length",
    "Apply length",
    () => {
      const s = useEditor.getState();
      if (!s.preview) return;
      assertValidDocumentEdit(s.document, s.preview);
      s.commit(s.preview);
    },
    () =>
      singleLine() &&
      !!useEditor.getState().preview &&
      !useEditor.getState().previewIssue,
    [{ key: "Enter" }],
  ),
  insertPoint: defineCommand<{ value: string | number; factor: number }>(
    "edge.insert-point",
    "Insert point",
    ({ value, factor }) => {
      const s = useEditor.getState();
      const target = placementOnEdge(s.document, s.selected[0], 0.5, {
        pointId: createId(),
        newEdgeId: createId(),
      });
      s.commit(
        applyPointPlacement(s.document, target, parseLength(value, factor)),
      );
    },
    () => {
      const s = useEditor.getState();
      return (
        s.selected.length === 1 &&
        !!s.document.segments[s.selected[0]] &&
        itemEditable(s.document, s.selected[0])
      );
    },
  ),
};
