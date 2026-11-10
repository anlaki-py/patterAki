import { commands } from "./commands";
import { hasOpenShortcutOverlay, isEditingText } from "./command";
import { useEditor } from "./store";

type KeyInput = Pick<
  KeyboardEvent,
  | "key"
  | "target"
  | "isComposing"
  | "ctrlKey"
  | "metaKey"
  | "altKey"
  | "defaultPrevented"
  | "preventDefault"
>;

/**
 * Handle Escape/Delete before page/browser bindings can steal the key.
 * Only unfinished edits are cancelled; committed work is never undone here.
 * Text editing and modal shortcuts retain their normal behavior.
 */
export function handleEditorEscapeDelete(event: KeyInput): boolean {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return false;
  if (hasOpenShortcutOverlay()) return false;

  const editor = useEditor.getState();
  if (event.key === "Escape") {
    if (
      !editor.hasDraft &&
      !editor.preview &&
      !editor.gestureActive &&
      !editor.moveDialogOpen
    )
      return false;
    event.preventDefault();
    editor.cancel();
    return true;
  }

  if (event.key !== "Delete" && event.key !== "Backspace") return false;
  if (isEditingText(event.target)) return false;
  // While drawing, Backspace/Delete remove the *draft* point in the viewport.
  if (editor.hasDraft || editor.preview || editor.gestureActive) return false;
  const deleteCommand = commands.delete.bind();
  if (!deleteCommand.enabled()) return false;
  event.preventDefault();
  deleteCommand.run();
  return true;
}
