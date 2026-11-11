import { pieceForItem } from "../document/pieceAccess";
import { attachInternalPath } from "../document/piecePathsEdit";
import { defineCommand } from "./command";
import { createId } from "./ids";
import { useEditor } from "./store";
import { pieceEdges } from "../document/pieces";
import {
  duplicatePieces,
  mirrorAround,
  pieceBounds,
  rotationAround,
  transformPieces,
} from "../document/pieceTransforms";
import type { PatternPiece } from "../document/schema";
export function selectedPieceIds() {
  const s = useEditor.getState();
  return Object.values(s.document.pieces)
    .filter((p) =>
      p.stitchingOutline.every((ref) => s.selected.includes(ref.segmentId)),
    )
    .map((p) => p.id);
}
/** Piece actions can target the parent of selected geometry without treating
 * an unconverted drafting path as a piece. */
export function pieceActionIds() {
  const s = useEditor.getState(),
    whole = selectedPieceIds();
  if (whole.length) return whole;
  const parent = pieceForItem(s.document, s.activePoint ?? s.selected[0] ?? "");
  return parent &&
    s.selected.every((id) => pieceForItem(s.document, id)?.id === parent.id)
    ? [parent.id]
    : [];
}
const idle = () => {
  const s = useEditor.getState();
  return !s.preview && !s.hasDraft && !s.gestureActive;
};
export const pieceTransformsEnabled = () => {
  const s = useEditor.getState(),
    ids = pieceActionIds();
  return (
    idle() &&
    ids.length > 0 &&
    ids.every(
      (id) => s.document.pieces[id].visible && !s.document.pieces[id].locked,
    )
  );
};
export function previewPieceRotation(degrees: number) {
  const s = useEditor.getState(),
    ids = pieceActionIds(),
    bounds = pieceBounds(s.document, ids);
  const pivot = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
  };
  useEditor.setState({
    preview: transformPieces(s.document, ids, rotationAround(degrees, pivot)),
    previewIssue: null,
    selected: ids.flatMap((id) =>
      pieceEdges(s.document, s.document.pieces[id]),
    ),
    activePoint: null,
    editPieceId: null,
  });
}
export const pieceCommands = {
  exitPieceEdit: defineCommand(
    "piece.exit-edit",
    "Select pieces",
    () => {
      const s = useEditor.getState(),
        piece = s.editPieceId ? s.document.pieces[s.editPieceId] : undefined;
      s.cancel();
      useEditor.setState({
        editPieceId: null,
        selected: piece ? pieceEdges(s.document, piece) : [],
        activePoint: null,
      });
    },
    () => !!useEditor.getState().editPieceId,
  ),
  setSelectedPieceState: defineCommand<
    Partial<Pick<PatternPiece, "visible" | "locked">>
  >(
    "piece.set-selection-state",
    "Update selected pieces",
    (patch) => {
      const s = useEditor.getState(),
        ids = new Set(pieceActionIds());
      s.commit({
        ...s.document,
        pieces: Object.fromEntries(
          Object.entries(s.document.pieces).map(([id, p]) => [
            id,
            ids.has(id) ? { ...p, ...patch } : p,
          ]),
        ),
      });
      if (patch.visible === false || patch.locked === true)
        useEditor.setState({
          selected: [],
          activePoint: null,
          editPieceId: null,
        });
    },
    () => idle() && pieceActionIds().length > 0,
  ),
  attachInternalPath: defineCommand<string>(
    "piece.attach-internal",
    "Attach selected loose path",
    (id) => {
      const s = useEditor.getState();
      s.commit(attachInternalPath(s.document, id, s.selected, createId()));
    },
    (id) =>
      idle() &&
      !!useEditor.getState().document.pieces[id] &&
      useEditor.getState().selected.length > 0,
  ),
  editPiece: defineCommand(
    "piece.edit",
    "Edit points",
    () => {
      const s = useEditor.getState(),
        id = pieceActionIds()[0];
      s.cancel();
      useEditor.setState({
        editPieceId: id,
        tool: "select",
        selected: [s.document.pieces[id].rootSegmentId],
        activePoint: null,
      });
    },
    () => pieceTransformsEnabled() && pieceActionIds().length === 1,
    [{ key: "e" }],
  ),
  selectPiece: defineCommand<string>(
    "piece.select",
    "Select piece",
    (id) => {
      const s = useEditor.getState();
      s.cancel();
      useEditor.setState({
        editPieceId: null,
        tool: "select",
        selected: pieceEdges(s.document, s.document.pieces[id]),
        activePoint: null,
      });
    },
    (id) => idle() && !!useEditor.getState().document.pieces[id]?.visible,
  ),
  updatePiece: defineCommand<{
    id: string;
    patch: Partial<
      Pick<PatternPiece, "name" | "metadata" | "locked" | "visible">
    >;
  }>(
    "piece.update",
    "Update piece",
    ({ id, patch }) => {
      const s = useEditor.getState();
      s.commit({
        ...s.document,
        pieces: {
          ...s.document.pieces,
          [id]: { ...s.document.pieces[id], ...patch },
        },
      });
      if (patch.visible === false || patch.locked === true)
        useEditor.setState({
          selected: [],
          activePoint: null,
          editPieceId: null,
        });
    },
    ({ id }) => idle() && !!useEditor.getState().document.pieces[id],
  ),
  duplicatePiece: defineCommand(
    "piece.duplicate",
    "Duplicate pieces",
    () => {
      const s = useEditor.getState(),
        result = duplicatePieces(s.document, pieceActionIds(), createId, {
          x: 10,
          y: 10,
        });
      s.commit(result.document);
      useEditor.setState({
        selected: result.pieceIds.flatMap((id) =>
          pieceEdges(result.document, result.document.pieces[id]),
        ),
        editPieceId: null,
        activePoint: null,
      });
    },
    pieceTransformsEnabled,
  ),
  mirrorPiece: defineCommand<"x" | "y">(
    "piece.mirror",
    "Mirror pieces",
    (axis) => {
      const s = useEditor.getState(),
        ids = pieceActionIds(),
        bounds = pieceBounds(s.document, ids);
      s.commit(
        transformPieces(
          s.document,
          ids,
          mirrorAround(axis, {
            x: (bounds.min.x + bounds.max.x) / 2,
            y: (bounds.min.y + bounds.max.y) / 2,
          }),
        ),
      );
    },
    pieceTransformsEnabled,
  ),
};
