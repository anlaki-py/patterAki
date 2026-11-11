import {
  clickPieceSelection,
  expandPieceSelection,
  pieceForEdge,
} from "../document/pieces";
import type { PatternDocument } from "../document/schema";

/** Individual geometry selection belongs to one parent; another piece exits edit mode. */
export function selectionForEdgeHit(
  doc: PatternDocument,
  selected: string[],
  id: string,
  additive: boolean,
  editPieceId: string | null,
) {
  const editingParent =
    editPieceId && pieceForEdge(doc, id)?.id === editPieceId;
  return {
    selected: editingParent
      ? clickSelection(selected, id, additive)
      : clickPieceSelection(
          doc,
          editPieceId ? expandPieceSelection(doc, selected) : selected,
          id,
          additive,
        ),
    editPieceId: editingParent ? editPieceId : null,
  };
}

export function clickSelection(
  selected: string[],
  id: string,
  additive: boolean,
): string[] {
  if (additive)
    return selected.includes(id)
      ? selected.filter((current) => current !== id)
      : [...selected, id];
  return contextSelection(selected, id);
}
export function contextSelection(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected : [id];
}
