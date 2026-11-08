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
