import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  commandRegistry,
  commands,
  dispatchShortcut,
  editCommands,
  nudgeCommands,
  toolCommands,
} from "./commands";
import { bindDraftCommands } from "./draftCommands";
import { tabCyclesTarget } from "./command";
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

it("E01 commits a typed 125 mm line exactly despite a nearby 120 mm grid target", () => {
  useEditor.getState().load({ ...emptyDocument("exact"), unitsDisplay: "mm" });
  useEditor.setState({
    tool: "line",
    snap: true,
    gridSnap: true,
    gridSpacingMm: 10,
  });
  const commitPath = (points: { x: number; y: number }[], closed = false) => {
    const s = useEditor.getState();
    s.commit(addPath(s.document, points, closed, id));
  };
  const actions = bindDraftCommands({
    draft: [{ x: 0, y: 0 }],
    exact: 125,
    degrees: 0,
    width: 18,
    height: 24,
    factor: 1,
    commitPath,
    setDraft: vi.fn(),
    clearExact: vi.fn(),
  });
  actions.exactLine.run();
  const doc = useEditor.getState().document;
  const edge = Object.values(doc.segments)[0];
  expect(segmentLength(doc, edge)).toBe(125);
  const points = Object.values(doc.points);
  expect(points).toContainEqual({ x: 125, y: 0 });

  useEditor.getState().load({ ...emptyDocument("angle"), unitsDisplay: "mm" });
  const angled = bindDraftCommands({
    draft: [{ x: 0, y: 0 }],
    exact: 125,
    degrees: 30,
    width: 18,
    height: 24,
    factor: 1,
    commitPath,
    setDraft: vi.fn(),
    clearExact: vi.fn(),
  });
  angled.exactLine.run();
  const angledDoc = useEditor.getState().document;
  const angledEdge = Object.values(angledDoc.segments)[0];
  const from = angledDoc.points[angledEdge.from];
  const to = angledDoc.points[angledEdge.to];
  expect(segmentLength(angledDoc, angledEdge)).toBeCloseTo(125, 12);
  expect(
    (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI,
  ).toBeCloseTo(30, 12);
});

it("E02 creates an exact-size rectangle without magnetic rounding", () => {
  useEditor.getState().load(emptyDocument("rectangle"));
  useEditor.setState({
    tool: "rectangle",
    snap: true,
    gridSnap: true,
    gridSpacingMm: 10,
  });
  const commitPath = (points: { x: number; y: number }[], closed = false) => {
    const s = useEditor.getState();
    s.commit(addPath(s.document, points, closed, id));
  };
  const actions = bindDraftCommands({
    draft: [{ x: 5, y: 5 }],
    exact: 12,
    degrees: 0,
    width: 18,
    height: 24,
    factor: 10,
    commitPath,
    setDraft: vi.fn(),
    clearExact: vi.fn(),
  });
  actions.rectangle.run();
  expect(Object.values(useEditor.getState().document.points)).toEqual(
    expect.arrayContaining([
      { x: 5, y: 5 },
      { x: 185, y: 5 },
      { x: 185, y: 245 },
      { x: 5, y: 245 },
    ]),
  );
});

it("M07 nudges by 1/10/0.1 mm with one history entry per keypress", () => {
  useEditor.getState().load(
    addPath(
      emptyDocument("nudge"),
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      false,
      id,
    ),
  );
  const document = useEditor.getState().document;
  const pointId = Object.keys(document.points)[1];
  useEditor.setState({
    tool: "select",
    selected: [],
    activePoint: pointId,
    gestureActive: false,
  });
  dispatchShortcut(keyEvent("ArrowRight"), nudgeCommands);
  expect(useEditor.getState().document.points[pointId]).toEqual({
    x: 101,
    y: 0,
  });
  expect(useEditor.getState().past).toHaveLength(1);
  dispatchShortcut(keyEvent("ArrowUp", { shiftKey: true }), nudgeCommands);
  expect(useEditor.getState().document.points[pointId]).toEqual({
    x: 101,
    y: -10,
  });
  dispatchShortcut(keyEvent("ArrowLeft", { altKey: true }), nudgeCommands);
  expect(useEditor.getState().document.points[pointId].x).toBeCloseTo(
    100.9,
    12,
  );
  expect(useEditor.getState().past).toHaveLength(3);
  useEditor.getState().undo();
  useEditor.getState().undo();
  useEditor.getState().undo();
  expect(useEditor.getState().document).toEqual(document);
});

it("S08 leaves Tab focus traversal alone in a field and blocks nudges", () => {
  class FocusedControl {
    closest() {
      return this;
    }
  }
  expect(tabCyclesTarget({ key: "Tab", target: null }, 2, true)).toBe(true);
  expect(tabCyclesTarget({ key: "Tab", target: null }, 1, true)).toBe(false);
  expect(tabCyclesTarget({ key: "Tab", target: null }, 2, false)).toBe(false);
  expect(tabCyclesTarget({ key: "ArrowRight", target: null }, 2, true)).toBe(
    false,
  );
  vi.stubGlobal("Element", FocusedControl);
  const target = new FocusedControl() as unknown as EventTarget;
  expect(tabCyclesTarget({ key: "Tab", target }, 2, true)).toBe(false);

  const document = useEditor.getState().document;
  const pointId = Object.keys(document.points)[0];
  useEditor.setState({
    activePoint: pointId,
    selected: [],
    gestureActive: false,
  });
  expect(
    dispatchShortcut(keyEvent("ArrowRight", { target }), nudgeCommands),
  ).toBe(false);
  expect(useEditor.getState().document).toBe(document);
  useEditor.setState({ gestureActive: true });
  dispatchShortcut(keyEvent("ArrowRight"), nudgeCommands);
  expect(useEditor.getState().document).toBe(document);
});
