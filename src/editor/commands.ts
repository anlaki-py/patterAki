import { defineCommand, localCommand } from "./command";
import { geometryCommands } from "./geometryCommands";
import { useEditor, type Tool } from "./store";
export { dispatchShortcut } from "./command";

const tools: { id: Tool; label: string; key: string }[] = [
  { id: "select", label: "Select", key: "v" },
  { id: "curve", label: "Curve", key: "c" },
  { id: "point", label: "Add point", key: "x" },
  { id: "line", label: "Line", key: "l" },
  { id: "polyline", label: "Polyline", key: "p" },
  { id: "rectangle", label: "Rectangle", key: "r" },
  { id: "pan", label: "Pan", key: "h" },
];
const toolDefinitions = tools.map((tool) =>
  defineCommand(
    tool.id,
    tool.label,
    () => {
      useEditor.getState().cancel();
      useEditor.setState({ tool: tool.id, selected: [] });
    },
    undefined,
    [{ key: tool.key }],
  ),
);
export const toolCommands = toolDefinitions.map((command, i) => ({
  ...command.bind(),
  id: tools[i].id,
}));
export const commands = {
  ...geometryCommands,
  undo: defineCommand(
    "undo",
    "Undo",
    () => useEditor.getState().undo(),
    () => {
      const s = useEditor.getState();
      return s.past.length > 0 || s.hasDraft || !!s.preview;
    },
    [{ key: "z", mod: true }],
  ),
  redo: defineCommand(
    "redo",
    "Redo",
    () => useEditor.getState().redo(),
    () => {
      const s = useEditor.getState();
      return s.future.length > 0 || s.hasDraft || !!s.preview;
    },
    [
      { key: "z", mod: true, shift: true },
      { key: "y", mod: true },
    ],
  ),
  selectAll: defineCommand(
    "select-all",
    "Select all",
    () => {
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
    () => {
      const doc = useEditor.getState().document;
      return (
        Object.keys(doc.segments).length + Object.keys(doc.annotations).length >
        0
      );
    },
    [{ key: "a", mod: true }],
  ),
  grid: defineCommand("view.grid", "Toggle grid", () =>
    useEditor.setState((s) => ({ grid: !s.grid })),
  ),
  snap: defineCommand("view.snap", "Snap", () =>
    useEditor.setState((s) => ({ snap: !s.snap })),
  ),
  cancel: defineCommand(
    "edit.cancel",
    "Cancel draft",
    () => useEditor.getState().cancel(),
    undefined,
    [{ key: "Escape" }],
  ),
  newProject: localCommand("project.new", "New project"),
  importProject: localCommand("project.import", "Import JSON…"),
  save: localCommand("project.save", "Save locally", [{ key: "s", mod: true }]),
  exportProject: localCommand("project.export", "Export editable JSON"),
  theme: localCommand("view.theme", "Toggle light / dark"),
  properties: localCommand("view.properties", "Properties"),
  hideProperties: localCommand("view.hide-properties", "Hide properties"),
  help: localCommand("help.controls", "Help"),
  fit: localCommand("view.fit", "Fit all"),
  resetView: localCommand("view.reset", "Reset view"),
  finish: localCommand("draft.finish", "Finish line", [{ key: "Enter" }]),
  removeDraftPoint: localCommand(
    "draft.remove-point",
    "Remove last draft point",
    [{ key: "Backspace" }, { key: "Delete" }],
  ),
  exactLine: localCommand("draft.exact-line", "Add exact line"),
  rectangle: localCommand("draft.rectangle", "Create rectangle"),
  changeLength: localCommand("edge.change-length", "Change length…"),
  exactPoint: localCommand("edge.exact-point", "Point at exact distance…"),
  editMark: localCommand("mark.edit", "Edit mark…", [{ key: "Enter" }]),
  text: localCommand("mark.text", "Text / piece label…"),
  arrow: localCommand("mark.arrow", "Arrow…"),
  grainline: localCommand("mark.grainline", "Grainline…"),
  fold: localCommand("mark.fold", "Place on fold guide…"),
  drill: localCommand("mark.drill", "Drill point / cross…"),
  applyMark: localCommand("mark.apply", "Apply mark", [
    { key: "Enter" },
    { key: "Enter", mod: true },
  ]),
  applyPoint: localCommand("point.apply", "Apply point", [{ key: "Enter" }]),
  cancelDialog: localCommand("dialog.cancel", "Cancel", [{ key: "Escape" }]),
  editLength: localCommand("edge.focus-length", "Edit length", [
    { key: "Enter" },
  ]),
  cancelGesture: localCommand("edit.cancel-gesture", "Cancel active gesture", [
    { key: "z", mod: true },
    { key: "z", mod: true, shift: true },
    { key: "y", mod: true },
  ]),
  escape: localCommand("edit.escape", "Cancel or return to Select", [
    { key: "Escape" },
  ]),
  temporaryPan: localCommand("view.temporary-pan", "Hold Space to pan", [
    { key: " " },
  ]),
};
export const commandRegistry = [...toolDefinitions, ...Object.values(commands)];
export const editCommands = [
  commands.undo.bind(),
  commands.redo.bind(),
  commands.delete.bind(),
  commands.selectAll.bind(),
];
