import { useState } from "react";
import type { Annotation, AnnotationKind } from "../document/annotationSchema";
import { newAnnotation } from "../document/annotations";
import type { Vec2 } from "../geometry/line";
import { AnnotationDialog } from "../ui/AnnotationDialog";
import type { AnnotationSession } from "./annotationEdit";
import { createId } from "./ids";
import { useEditor } from "./store";
export function useAnnotationEditor() {
  const cancelVersion = useEditor((s) => s.cancelVersion);
  const revision = useEditor((s) => s.revision);
  const [session, setSession] = useState<AnnotationSession | null>(null);
  const active =
    session &&
    session.cancelVersion === cancelVersion &&
    session.revision === revision;
  const open = (annotation: Annotation) => {
    useEditor.getState().cancel();
    const state = useEditor.getState();
    useEditor.setState({
      tool: "select",
      selected: state.document.annotations[annotation.id]
        ? [annotation.id]
        : [],
    });
    setSession({
      base: state.document,
      annotation,
      revision: state.revision,
      cancelVersion: state.cancelVersion,
    });
  };
  const close = () => {
    useEditor.setState({ preview: null });
    setSession(null);
  };
  return {
    add: (kind: AnnotationKind, point: Vec2) =>
      open(newAnnotation(kind, point, createId())),
    edit: (id: string) => {
      const mark = useEditor.getState().document.annotations[id];
      if (mark) open(mark);
    },
    dialog: active ? (
      <AnnotationDialog
        key={session.annotation.id}
        session={session}
        onClose={close}
      />
    ) : null,
  };
}
