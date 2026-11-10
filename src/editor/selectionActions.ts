import { deleteAnnotations } from "../document/annotations";
import { deleteSegments } from "../document/operations";
import { useEditor } from "./store";

export function deleteSelection(ids: string[]) {
  if (!ids.length) return;
  const s = useEditor.getState();
  if (ids.some((id) => !s.document.segments[id] && !s.document.annotations[id]))
    throw new Error("A selected item no longer exists.");
  const edges = ids.filter((id) => !!s.document.segments[id]);
  const next = deleteAnnotations(
    edges.length ? deleteSegments(s.document, edges) : s.document,
    ids,
  );
  s.cancel();
  s.commit(next);
}

/** Delete a selected vertex and all its attached edges, as one undoable edit. */
export function deleteActivePoint(id: string) {
  const s = useEditor.getState();
  if (!s.document.points[id]) return;
  const adjacent = Object.values(s.document.segments)
    .filter((edge) => edge.from === id || edge.to === id)
    .map((edge) => edge.id);
  const next = adjacent.length
    ? deleteSegments(s.document, adjacent)
    : {
        ...s.document,
        points: Object.fromEntries(
          Object.entries(s.document.points).filter(
            ([pointId]) => pointId !== id,
          ),
        ),
      };
  s.cancel();
  s.commit(next);
}
