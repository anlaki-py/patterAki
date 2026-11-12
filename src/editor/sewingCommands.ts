import { defineCommand } from "./command";
import { useEditor } from "./store";
import { createId } from "./ids";
import { attachAnnotation, updateSewing } from "../document/sewing";
import { mirrorOnFold, unfoldPiece } from "../document/unfold";
import type { PatternDocument } from "../document/schema";
function editable(pieceId: string) {
  const s = useEditor.getState(),
    p = s.document.pieces[pieceId];
  return (
    !!p?.visible && !p.locked && !s.preview && !s.hasDraft && !s.gestureActive
  );
}
export const sewingCommands = {
  updateSewing: defineCommand<{
    pieceId: string;
    change: Parameters<typeof updateSewing>[2];
  }>(
    "sewing.update",
    "Update sewing records",
    ({ pieceId, change }) => {
      const s = useEditor.getState();
      s.commit(updateSewing(s.document, pieceId, change));
    },
    ({ pieceId }) => editable(pieceId),
  ),
  attachSewingAnnotation: defineCommand<{
    pieceId: string;
    annotationId: string;
    edgeId?: string;
  }>(
    "sewing.attach-annotation",
    "Attach selected legacy mark",
    ({ pieceId, annotationId, edgeId }) => {
      const s = useEditor.getState();
      s.commit(
        attachAnnotation(s.document, pieceId, annotationId, createId(), edgeId),
      );
    },
    ({ pieceId }) => editable(pieceId),
  ),
  foldPiece: defineCommand<{
    pieceId: string;
    edgeId: string;
    unfold: boolean;
  }>(
    "sewing.fold-transform",
    "Transform across fold edge",
    ({ pieceId, edgeId, unfold }) => {
      const s = useEditor.getState();
      s.commit(
        unfold
          ? unfoldPiece(s.document, pieceId, edgeId, createId)
          : mirrorOnFold(s.document, pieceId, edgeId),
      );
    },
    ({ pieceId }) => editable(pieceId),
  ),
  applySewingPreview: defineCommand<{
    base: PatternDocument;
    candidate: PatternDocument;
  }>(
    "sewing.apply-preview",
    "Apply sewing edit",
    ({ candidate }) => useEditor.getState().commit(candidate),
    ({ base }) => {
      const s = useEditor.getState();
      return s.document === base && !s.hasDraft && !s.gestureActive;
    },
  ),
};
