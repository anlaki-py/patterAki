import { convertToCurve, straightenCurve } from "../document/curves";
import { addIntersectionPoints } from "../document/intersections";
import { assertValidDocumentEdit } from "../document/contourValidation";
import { createId } from "./ids";
import { useEditor } from "./store";
export function executeEdgeActions(
  ids: string[],
  action: "reset" | "curve" | "intersections",
) {
  const unique = [...new Set(ids)];
  if (!unique.length) return "";
  const s = useEditor.getState();
  if (unique.some((id) => !s.document.segments[id]))
    throw new Error("A selected edge no longer exists.");
  let next = s.document,
    message = "";
  if (action === "reset") next = unique.reduce(straightenCurve, next);
  if (action === "curve") next = unique.reduce(convertToCurve, next);
  if (action === "intersections") {
    if (unique.length !== 1)
      throw new Error("Select one edge to create intersection points.");
    const result = addIntersectionPoints(next, unique[0], createId);
    next = result.document;
    message = result.splitCount
      ? `Added intersection points with ${result.splitCount} segment splits.`
      : "No new splits needed. Crossings are already connected or none were found.";
  }
  assertValidDocumentEdit(s.document, next);
  s.commit(next);
  useEditor.setState({ selected: unique });
  return message;
}
