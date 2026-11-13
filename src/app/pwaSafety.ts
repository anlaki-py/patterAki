import { useEditor } from "../editor/store";
import { saveNow } from "../persistence/autosave";

export function updateBlocked() {
  const s = useEditor.getState();
  return (
    (typeof document !== "undefined" &&
      !!document.querySelector("[role=dialog]")) ||
    !s.ready ||
    s.hasDraft ||
    !!s.preview ||
    s.gestureActive ||
    s.moveDialogOpen ||
    !!s.lengthDialogEdge
  );
}
/** Never authorize a reload using a save from an older document revision. */
export async function safeguardUpdate(save = saveNow) {
  if (updateBlocked())
    throw new Error("Finish or cancel the active edit before updating.");
  const before = useEditor.getState();
  if (!(await save()))
    throw new Error(
      "Could not safeguard the project. Keep editing, export JSON or save a recovery copy before updating.",
    );
  const after = useEditor.getState();
  if (
    updateBlocked() ||
    after.document !== before.document ||
    after.revision !== before.revision ||
    after.saveStatus !== "Saved locally"
  )
    throw new Error(
      "The drawing changed while saving. Retry the update after finishing edits.",
    );
}
