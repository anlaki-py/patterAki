import { useEditor } from "./store";

export type Shortcut = {
  key: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
};
export type BoundCommand = {
  id: string;
  label: string;
  shortcut: string;
  keys: readonly Shortcut[];
  enabled: () => boolean;
  run: () => unknown;
};
export function defineCommand<Context = void>(
  id: string,
  label: string,
  execute: (context: Context) => unknown,
  enabled: (context: Context) => boolean = () => true,
  keys: readonly Shortcut[] = [],
) {
  const shortcut = keys
    .map(
      ({ key, mod, shift, alt }) =>
        `${mod ? "Ctrl/Cmd+" : ""}${shift ? "Shift+" : ""}${alt ? "Alt+" : ""}${key === " " ? "Space" : key.length === 1 ? key.toUpperCase() : key}`,
    )
    .join(" / ");
  return {
    id,
    label,
    shortcut,
    keys,
    enabled,
    run: (context: Context) =>
      enabled(context) ? execute(context) : undefined,
    bind(context: Context): BoundCommand {
      return {
        id,
        label,
        shortcut,
        keys,
        enabled: () => enabled(context),
        run: () => this.run(context),
      };
    },
  };
}
// Viewport and dialog state stays with its mounted React owner. A binding is
// explicit and short-lived; unmounted owners never leave callbacks in a registry.
export type LocalAction = { execute: () => unknown; enabled?: () => boolean };
export function localCommand(
  id: string,
  label: string,
  keys: readonly Shortcut[] = [],
) {
  return defineCommand<LocalAction>(
    id,
    label,
    (action) => action.execute(),
    (action) => action.enabled?.() ?? true,
    keys,
  );
}
export function isEditingText(target: EventTarget | null) {
  return (
    typeof Element !== "undefined" &&
    target instanceof Element &&
    !!target.closest(
      'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="dialog"],[role="menu"],[role="listbox"],[role="combobox"]',
    )
  );
}
/** Hidden portal content must not disable workspace keyboard shortcuts. */
export function hasOpenShortcutOverlay() {
  if (typeof document === "undefined") return false;
  const selector = '[role="dialog"], [role="menu"], [role="listbox"]';
  // Some test/host environments supply a partial Document with only
  // querySelector. Treat its result as an open overlay, as earlier
  // dispatchShortcut versions did. In browsers, check visibility so
  // hidden Mantine portal content does not block shortcuts.
  if (typeof document.querySelectorAll !== "function") {
    return (
      typeof document.querySelector === "function" &&
      !!document.querySelector(selector)
    );
  }
  return [...document.querySelectorAll(selector)].some((element) => {
    if (element.closest('[hidden], [aria-hidden="true"], [inert]'))
      return false;
    if (typeof window === "undefined") return true;
    // Closed Mantine selects retain listboxes inside display:none dropdowns.
    // Their own computed display is still block, but they have no layout boxes.
    if (
      typeof element.getClientRects === "function" &&
      element.getClientRects().length === 0
    )
      return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}
/** Tab may cycle snap choices only while a real placement preview is active. */
export function tabCyclesTarget(
  event: Pick<KeyboardEvent, "key" | "target">,
  candidates: number,
  previewActive: boolean,
) {
  return (
    event.key === "Tab" &&
    candidates > 1 &&
    previewActive &&
    !isEditingText(event.target)
  );
}
export function dispatchShortcut(
  event: Pick<
    KeyboardEvent,
    | "key"
    | "ctrlKey"
    | "metaKey"
    | "shiftKey"
    | "altKey"
    | "isComposing"
    | "defaultPrevented"
    | "target"
    | "preventDefault"
  >,
  commands: readonly BoundCommand[],
) {
  if (event.defaultPrevented || event.isComposing || hasOpenShortcutOverlay())
    return false;

  // Escape cancels any unfinished drawing or gesture first. No undo entry is
  // created, and a subsequent Escape can still return to Select via the local
  // viewport command. This also works after just the *first* drawing click.
  if (event.key === "Escape") {
    const editor = useEditor.getState();
    if (editor.hasDraft || editor.preview || editor.gestureActive) {
      event.preventDefault();
      editor.cancel();
      return true;
    }
  }

  // Typing shortcuts stay disabled in text fields; Escape above is the
  // exception while an edit is active, including the numeric entry bar.
  if (isEditingText(event.target)) return false;

  const command = commands.find((candidate) =>
    candidate.keys.some(
      (key) =>
        key.key.toLowerCase() === event.key.toLowerCase() &&
        !!key.mod === (event.ctrlKey || event.metaKey) &&
        !!key.shift === event.shiftKey &&
        !!key.alt === event.altKey,
    ),
  );
  if (!command) return false;
  event.preventDefault();
  command.run();
  return true;
}
