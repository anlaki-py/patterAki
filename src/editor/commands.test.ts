import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  commandRegistry,
  commands,
  dispatchShortcut,
  editCommands,
  toolCommands,
} from "./commands";
import { bindDraftCommands } from "./draftCommands";
import { commandProps } from "../ui/CommandControls";
import { useEditor } from "./store";
import { addPath } from "../document/operations";
import { emptyDocument } from "../document/schema";
import { segmentLength } from "../document/segments";

let sequence = 0;
const id = () => `id-${++sequence}`;
function keyEvent(key: string, options: Partial<KeyboardEvent> = {}) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    isComposing: false,
    defaultPrevented: false,
    target: null,
    preventDefault: vi.fn(),
    ...options,
  };
}
beforeEach(() => {
  sequence = 0;
  useEditor.getState().load(
    addPath(
      emptyDocument("commands"),
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      false,
      id,
    ),
  );
  useEditor.setState({ tool: "select", snap: true, grid: true });
});
afterEach(() => vi.unstubAllGlobals());

it("registers unique IDs, labels, availability and execution for all action groups", () => {
  const ids = commandRegistry.map((command) => command.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const command of commandRegistry) {
    expect(command.label).not.toBe("");
    expect(command.enabled).toBeTypeOf("function");
    expect(command.run).toBeTypeOf("function");
    expect(command.shortcut).toBeTypeOf("string");
  }
  expect(ids).toEqual(
    expect.arrayContaining([
      "project.save",
      "view.grid",
      "edge.insert-point",
      "mark.apply",
      "draft.finish",
      "dialog.cancel",
    ]),
  );
});
it("rechecks availability when an already-bound command executes", () => {
  const command = commands.delete.bind();
  const base = useEditor.getState().document;
  expect(command.enabled()).toBe(false);
  command.run();
  expect(useEditor.getState().past).toHaveLength(0);
  useEditor.setState({ selected: Object.keys(base.segments) });
  expect(command.enabled()).toBe(true);
  command.run();
  expect(Object.keys(useEditor.getState().document.segments)).toHaveLength(0);
  expect(useEditor.getState().past).toHaveLength(1);
  commands.undo.bind().run();
  expect(useEditor.getState().document).toEqual(base);
  commands.redo.bind().run();
  expect(Object.keys(useEditor.getState().document.segments)).toHaveLength(0);
});
it("never deletes committed geometry while a draft is active", () => {
  const base = useEditor.getState().document;
  useEditor.setState({ selected: Object.keys(base.segments), hasDraft: true });
  dispatchShortcut(keyEvent("Backspace"), editCommands);
  commands.delete.bind().run();
  expect(useEditor.getState().document).toBe(base);
  expect(useEditor.getState().past).toHaveLength(0);
});
it("preserves history when undo cancels a length preview", () => {
  const base = useEditor.getState().document;
  useEditor.setState({ selected: Object.keys(base.segments) });
  commands.previewLength
    .bind({ value: 12, factor: 10, anchor: "center" })
    .run();
  expect(useEditor.getState().document).toBe(base);
  expect(useEditor.getState().preview).not.toBeNull();
  dispatchShortcut(keyEvent("z", { metaKey: true }), editCommands);
  expect(useEditor.getState().preview).toBeNull();
  expect(useEditor.getState().document).toBe(base);
  expect(useEditor.getState().past).toHaveLength(0);
});
it("uses the same curve conversion and exact insertion operations for every binding", () => {
  const base = useEditor.getState().document;
  useEditor.setState({ selected: Object.keys(base.segments) });
  commands.curve.bind().run();
  const curved = useEditor.getState().document;
  expect(Object.values(curved.segments)[0].kind).toBe("cubic");
  commands.insertPoint.bind({ value: 3, factor: 10 }).run();
  const split = useEditor.getState().document;
  const lengths = Object.values(split.segments).map((edge) =>
    segmentLength(split, edge),
  );
  expect(lengths[0]).toBeCloseTo(30, 6);
  expect(lengths[1]).toBeCloseTo(70, 6);
  expect(useEditor.getState().past).toHaveLength(2);
  commands.undo.bind().run();
  expect(useEditor.getState().document).toEqual(curved);
  commands.reset.bind().run(); // Undo clears selection, so a stale menu action is disabled.
  expect(useEditor.getState().document).toEqual(curved);
});
it("rejects invalid lengths and splits without changing geometry or history", () => {
  const base = useEditor.getState().document;
  useEditor.setState({ selected: Object.keys(base.segments) });
  expect(() =>
    commands.previewLength
      .bind({ value: -2, factor: 10, anchor: "start" })
      .run(),
  ).toThrow();
  expect(() =>
    commands.insertPoint.bind({ value: 20, factor: 10 }).run(),
  ).toThrow();
  expect(useEditor.getState().document).toBe(base);
  expect(useEditor.getState().past).toHaveLength(0);
  expect(useEditor.getState().preview).toBeNull();
});
it("applies an exact length once and restores exact geometry with undo", () => {
  const base = useEditor.getState().document;
  useEditor.setState({ selected: Object.keys(base.segments) });
  commands.previewLength
    .bind({ value: 120, factor: 1, anchor: "center" })
    .run();
  const apply = commands.applyLength.bind();
  apply.run();
  apply.run();
  const state = useEditor.getState(),
    edge = Object.values(state.document.segments)[0];
  expect(state.document.points[edge.from]).toEqual({ x: -10, y: 0 });
  expect(state.document.points[edge.to]).toEqual({ x: 110, y: 0 });
  expect(state.past).toHaveLength(1);
  commands.undo.bind().run();
  expect(useEditor.getState().document).toEqual(base);
});
it("view toggles leave canonical dimensions and history alone", () => {
  const base = useEditor.getState().document;
  commands.grid.bind().run();
  commands.snap.bind().run();
  expect(useEditor.getState()).toMatchObject({
    grid: false,
    snap: false,
    past: [],
  });
  expect(useEditor.getState().document).toBe(base);
});
it("renames and changes display units through validated history", () => {
  const base = useEditor.getState().document;
  commands.rename.bind("Panel").run();
  commands.units.bind("in").run();
  commands.rename.bind("   ").run();
  commands.rename.bind("a".repeat(121)).run();
  expect(useEditor.getState().document).toMatchObject({
    name: "Panel",
    unitsDisplay: "in",
    points: base.points,
  });
  expect(useEditor.getState().past).toHaveLength(2);
});
describe("shortcuts", () => {
  it.each([
    ["v", "select"],
    ["c", "curve"],
    ["x", "point"],
    ["l", "line"],
    ["p", "polyline"],
    ["r", "rectangle"],
    ["h", "pan"],
  ])("keeps %s bound to %s", (key, tool) => {
    useEditor.setState({ hasDraft: true });
    expect(dispatchShortcut(keyEvent(key), toolCommands)).toBe(true);
    expect(useEditor.getState()).toMatchObject({ tool, hasDraft: false });
  });
  it("uses one save binding for direct invocation and Ctrl/Cmd+S", async () => {
    const save = vi.fn().mockResolvedValue(false);
    const command = commands.save.bind({ execute: save });
    expect(await command.run()).toBe(false);
    commandProps(command).onClick();
    dispatchShortcut(keyEvent("s", { ctrlKey: true }), [command]);
    dispatchShortcut(keyEvent("s", { metaKey: true }), [command]);
    expect(save).toHaveBeenCalledTimes(4);
    expect(command.shortcut).toBe("Ctrl/Cmd+S");
  });
  it("respects disabled local actions and leaves unrelated browser keys alone", () => {
    const execute = vi.fn();
    const command = commands.save.bind({ execute, enabled: () => false });
    const event = keyEvent("s", { ctrlKey: true });
    dispatchShortcut(event, [command]);
    command.run();
    expect(execute).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalled();
    const unrelated = keyEvent("s");
    expect(dispatchShortcut(unrelated, [command])).toBe(false);
    expect(unrelated.preventDefault).not.toHaveBeenCalled();
  });
  it("leaves text/dialog targets, composition, Alt and already handled keys alone", () => {
    class FocusedControl {
      closest() {
        return this;
      }
    }
    vi.stubGlobal("Element", FocusedControl);
    const events = [
      keyEvent("l", { target: new FocusedControl() as unknown as EventTarget }),
      keyEvent("l", { isComposing: true }),
      keyEvent("l", { altKey: true }),
      keyEvent("l", { defaultPrevented: true }),
    ];
    for (const event of events) {
      expect(dispatchShortcut(event, toolCommands)).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(useEditor.getState().tool).toBe("select");
  });
});
it("draft commands share exact dimensions, cancellation and keyboard/button completion", () => {
  const commitPath = vi.fn(),
    setDraft = vi.fn(),
    clearExact = vi.fn();
  const draft = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
  ];
  const actions = bindDraftCommands({
    draft,
    exact: 12,
    degrees: 0,
    width: 18,
    height: 24,
    factor: 10,
    commitPath,
    setDraft,
    clearExact,
  });
  dispatchShortcut(keyEvent("Backspace"), [actions.removePoint]);
  expect(setDraft).toHaveBeenCalledWith([draft[0]]);
  dispatchShortcut(keyEvent("Enter"), [actions.finish]);
  actions.finish.run();
  expect(commitPath.mock.calls.slice(0, 2)).toEqual([[draft], [draft]]);
  useEditor.setState({ tool: "line" });
  actions.exactLine.run();
  expect(commitPath).toHaveBeenLastCalledWith([draft[1], { x: 140, y: 0 }]);
  actions.rectangle.run();
  expect(commitPath).toHaveBeenLastCalledWith(
    [
      { x: 20, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 240 },
      { x: 20, y: 240 },
    ],
    true,
  );
  const invalid = bindDraftCommands({
    draft,
    exact: NaN,
    degrees: 0,
    width: -1,
    height: 24,
    factor: 10,
    commitPath,
    setDraft,
    clearExact,
  });
  commitPath.mockClear();
  invalid.exactLine.run();
  invalid.rectangle.run();
  expect(commitPath).not.toHaveBeenCalled();
});

it("batch edge commands retain selections and commit only one edit", () => {
  const s = useEditor.getState();
  const doc = addPath(
    s.document,
    [
      { x: 0, y: 10 },
      { x: 100, y: 10 },
    ],
    false,
    id,
  );
  s.load(doc);
  useEditor.setState({ selected: Object.keys(doc.segments), hasDraft: true });
  expect(commands.intersections.bind().enabled()).toBe(false);
  commands.intersections.bind().run();
  expect(useEditor.getState().document).toBe(doc);
  commands.curve.bind().run();
  expect(useEditor.getState().hasDraft).toBe(false);
  expect(useEditor.getState().selected).toEqual(Object.keys(doc.segments));
  expect(
    Object.values(useEditor.getState().document.segments).every(
      (edge) => edge.kind === "cubic",
    ),
  ).toBe(true);
  expect(useEditor.getState().past).toHaveLength(1);
  commands.reset.bind().run();
  expect(
    Object.values(useEditor.getState().document.segments).every(
      (edge) => edge.kind === "line",
    ),
  ).toBe(true);
  expect(useEditor.getState().past).toHaveLength(2);
  commands.undo.bind().run();
  commands.undo.bind().run();
  expect(useEditor.getState().document).toEqual(doc);
});
