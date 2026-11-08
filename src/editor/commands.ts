import { deleteSelection } from "./selectionActions";
import { useEditor, type Tool } from "./store";
export const toolCommands: { id: Tool; label: string; key: string }[] = [
  { id: "select", label: "Select", key: "v" },
  { id: "curve", label: "Curve", key: "c" },
  { id: "point", label: "Add point", key: "x" },
  { id: "line", label: "Line", key: "l" },
  { id: "polyline", label: "Polyline", key: "p" },
  { id: "rectangle", label: "Rectangle", key: "r" },
  { id: "pan", label: "Pan", key: "h" },
];
export function activateTool(tool: Tool) {
  useEditor.getState().cancel();
  useEditor.setState({ tool, selected: [] });
}
export const editCommands = [
  {
    id: "undo",
    label: "Undo",
    shortcut: "Ctrl/Cmd+Z",
    enabled: () =>
      useEditor.getState().past.length > 0 ||
      useEditor.getState().hasDraft ||
      !!useEditor.getState().preview,
    run: () => useEditor.getState().undo(),
  },
  {
    id: "redo",
    label: "Redo",
    shortcut: "Ctrl/Cmd+Shift+Z",
    enabled: () => useEditor.getState().future.length > 0,
    run: () => useEditor.getState().redo(),
  },
  {
    id: "delete",
    label: "Delete selection",
    shortcut: "Delete",
    enabled: () => useEditor.getState().selected.length > 0,
    run: () => {
      const s = useEditor.getState();
      deleteSelection(s.selected);
    },
  },
  {
    id: "select-all",
    label: "Select all",
    shortcut: "Ctrl/Cmd+A",
    enabled: () =>
      Object.keys(useEditor.getState().document.segments).length +
        Object.keys(useEditor.getState().document.annotations).length >
      0,
    run: () => {
      const s = useEditor.getState();
      s.cancel();
      useEditor.setState({
        tool: "select",
        selected: [
          ...Object.keys(s.document.segments),
          ...Object.keys(s.document.annotations),
        ],
      });
    },
  },
];
export function isEditingText(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    !!target.closest(
      'input,textarea,select,[contenteditable="true"],[role="dialog"],[role="menu"]',
    )
  );
}
