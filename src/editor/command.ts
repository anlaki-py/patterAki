export type Shortcut = { key: string; mod?: boolean; shift?: boolean };
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
      ({ key, mod, shift }) =>
        `${mod ? "Ctrl/Cmd+" : ""}${shift ? "Shift+" : ""}${key === " " ? "Space" : key.length === 1 ? key.toUpperCase() : key}`,
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
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.altKey ||
    isEditingText(event.target)
  )
    return false;
  const command = commands.find((candidate) =>
    candidate.keys.some(
      (key) =>
        key.key.toLowerCase() === event.key.toLowerCase() &&
        !!key.mod === (event.ctrlKey || event.metaKey) &&
        !!key.shift === event.shiftKey,
    ),
  );
  if (!command) return false;
  event.preventDefault();
  command.run();
  return true;
}
