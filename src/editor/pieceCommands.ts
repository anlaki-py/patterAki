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
const idle = () => {
  const s = useEditor.getState();
  return !s.preview && !s.hasDraft && !s.gestureActive;
};
const transformEnabled = () => {
  const s = useEditor.getState(),
    ids = selectedPieceIds();
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
    ids = selectedPieceIds(),
    bounds = pieceBounds(s.document, ids);
  const pivot = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
  };
  useEditor.setState({
    preview: transformPieces(s.document, ids, rotationAround(degrees, pivot)),
    previewIssue: null,
  });
}
export const pieceCommands = {
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
        id = selectedPieceIds()[0];
      s.cancel();
      useEditor.setState({
        editPieceId: id,
        tool: "select",
        selected: [s.document.pieces[id].rootSegmentId],
        activePoint: null,
      });
    },
    () => transformEnabled() && selectedPieceIds().length === 1,
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
        result = duplicatePieces(s.document, selectedPieceIds(), createId, {
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
    transformEnabled,
  ),
  mirrorPiece: defineCommand<"x" | "y">(
    "piece.mirror",
    "Mirror pieces",
    (axis) => {
      const s = useEditor.getState(),
        ids = selectedPieceIds(),
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
    transformEnabled,
  ),
};
