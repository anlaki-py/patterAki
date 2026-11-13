import { notifications } from "@mantine/notifications";
import { copyMarks, pasteMarks } from "../document/markCopies";
import { deleteAnnotations } from "../document/annotations";
import type { Vec2 } from "../geometry/line";
import type { Annotation } from "../document/annotationSchema";
import { defineCommand } from "./command";
import { createId } from "./ids";
import { useEditor } from "./store";

function idle() {
  const s = useEditor.getState();
  return (
    !s.hasDraft &&
    !s.preview &&
    !s.gestureActive &&
    !s.moveDialogOpen &&
    !s.lengthDialogEdge
  );
}
function selectedMarkIds() {
  const s = useEditor.getState();
  return s.selected.filter((id) => !!s.document.annotations[id]);
}
function marksSelected() {
  return idle() && selectedMarkIds().length > 0;
}
function report(action: () => void) {
  try {
    action();
  } catch (error) {
    notifications.show({
      color: "red",
      message:
        error instanceof Error
          ? error.message
          : "Could not copy or paste marks.",
    });
  }
}
function insert(marks: readonly Annotation[], delta: Vec2) {
  const s = useEditor.getState();
  const result = pasteMarks(s.document, marks, delta, createId);
  s.commit(result.document);
  s.cancel();
  useEditor.setState({
    selected: result.markIds,
    activePoint: null,
    selectedGuide: null,
    editPieceId: null,
    tool: "select",
  });
}
/** Offset in model millimetres, skipping occupied anchors so copies stay visible. */
function nextMarkOffset(marks: readonly Annotation[], start: number) {
  const existing = Object.values(useEditor.getState().document.annotations);
  let step = start;
  while (
    marks.some((mark) =>
      existing.some(
        (other) =>
          Math.abs(other.position.x - mark.position.x - 10 * step) < 1e-6 &&
          Math.abs(other.position.y - mark.position.y - 10 * step) < 1e-6,
      ),
    )
  )
    step++;
  return { step, delta: { x: 10 * step, y: 10 * step } };
}
export const markClipboardCommands = {
  copyMarks: defineCommand(
    "mark.copy",
    "Copy marks",
    () =>
      report(() => {
        const s = useEditor.getState();
        const marks = copyMarks(s.document, selectedMarkIds());
        useEditor.setState({ markClipboard: { marks, pasteCount: 0 } });
      }),
    marksSelected,
    [{ key: "c", mod: true }],
  ),
  cutMarks: defineCommand(
    "mark.cut",
    "Cut marks",
    () =>
      report(() => {
        const s = useEditor.getState(),
          ids = selectedMarkIds(),
          marks = copyMarks(s.document, ids);
        s.commit(deleteAnnotations(s.document, ids));
        s.cancel();
        useEditor.setState({
          markClipboard: { marks, pasteCount: 0 },
          activePoint: null,
          selectedGuide: null,
        });
      }),
    marksSelected,
    [{ key: "x", mod: true }],
  ),
  duplicateMarks: defineCommand(
    "mark.duplicate",
    "Duplicate marks",
    () =>
      report(() => {
        const s = useEditor.getState();
        const marks = copyMarks(s.document, selectedMarkIds());
        insert(marks, nextMarkOffset(marks, 1).delta);
      }),
    marksSelected,
    [{ key: "d", mod: true }],
  ),
  pasteMarks: defineCommand<Vec2 | undefined>(
    "mark.paste",
    "Paste marks",
    (point) =>
      report(() => {
        const clipboard = useEditor.getState().markClipboard;
        if (!clipboard?.marks.length) return;
        const placement = point
          ? {
              step: clipboard.pasteCount + 1,
              delta: {
                x: point.x - clipboard.marks[0].position.x,
                y: point.y - clipboard.marks[0].position.y,
              },
            }
          : nextMarkOffset(clipboard.marks, clipboard.pasteCount + 1);
        insert(clipboard.marks, placement.delta);
        useEditor.setState({
          markClipboard: { ...clipboard, pasteCount: placement.step },
        });
      }),
    () => idle() && !!useEditor.getState().markClipboard?.marks.length,
    [{ key: "v", mod: true }],
  ),
};
