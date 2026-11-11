import { useEditor } from "../editor/store";
import { DraggableModal } from "./DraggableModal";
import { LengthEditor } from "./LengthEditor";
import { CurveProperties } from "./CurveProperties";

export function openLengthEditor(id: string) {
  const s = useEditor.getState();
  if (s.gestureActive || s.hasDraft || !s.document.segments[id]) return;
  s.cancel();
  useEditor.setState({ selected: [id], lengthDialogEdge: id });
}
export function EdgeLengthDialog() {
  const s = useEditor();
  const edge = s.lengthDialogEdge
    ? s.document.segments[s.lengthDialogEdge]
    : undefined;
  if (!edge) return null;
  return (
    <DraggableModal
      title={edge.kind === "line" ? "Change line length" : "Curve dimensions"}
      onClose={s.cancel}
    >
      {edge.kind === "line" ? (
        <LengthEditor
          key={`${edge.id}-${s.revision}`}
          lengthOnly
          onApplied={s.cancel}
        />
      ) : (
        <CurveProperties key={edge.id} />
      )}
    </DraggableModal>
  );
}
