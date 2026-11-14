import { beforeEach, expect, it } from "vitest";
import { addPath } from "../document/operations";
import { emptyDocument } from "../document/schema";
import { commands, toolCommands } from "./commands";
import { beginCurveDrag } from "./curveDrag";
import { beginSelectionDrag } from "./selectionDrag";
import { useEditor } from "./store";

beforeEach(() => {
  let next = 0;
  useEditor.getState().load(
    addPath(
      emptyDocument("focus-loss"),
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      false,
      () => `focus-${++next}`,
    ),
  );
  useEditor.setState({ tool: "select" });
});

it("interrupts a pressed gesture while preserving an unfinished draft and history", () => {
  const s = useEditor.getState();
  s.commit({ ...s.document, name: "Saved draft" });
  s.undo();
  useEditor.setState({ hasDraft: true, gestureActive: true });
  const before = useEditor.getState();

  before.interruptGesture();

  const after = useEditor.getState();
  expect(after.hasDraft).toBe(true);
  expect(after.gestureActive).toBe(false);
  expect(after.document).toBe(before.document);
  expect(after.past).toBe(before.past);
  expect(after.future).toBe(before.future);
  expect(after.revision).toBe(before.revision);
  expect(after.saveStatus).toBe(before.saveStatus);
  expect(after.cancelVersion).toBe(before.cancelVersion + 1);
});

it("removes an invalid gesture preview without changing the selection or committed drawing", () => {
  const before = useEditor.getState();
  const selected = Object.keys(before.document.segments);
  useEditor.setState({
    selected,
    gestureActive: true,
    preview: { ...before.document, name: "Uncommitted" },
    previewIssue: "Invalid contour",
  });
  useEditor.getState().interruptGesture();
  expect(useEditor.getState()).toMatchObject({
    document: before.document,
    selected,
    preview: null,
    previewIssue: null,
    gestureActive: false,
    revision: before.revision,
  });
  expect(useEditor.getState().past).toBe(before.past);
});

it.each(["curve", "selection"] as const)(
  "focus interruption invalidates the %s controller before delayed move/release callbacks",
  (kind) => {
    const before = useEditor.getState().document;
    const edgeId = Object.keys(before.segments)[0];
    const drag =
      kind === "curve"
        ? beginCurveDrag({
            edgeId,
            point: { x: 50, y: 0 },
            pointer: 7,
            scale: 2,
          })!
        : beginSelectionDrag({
            itemId: edgeId,
            point: { x: 50, y: 0 },
            pointer: 7,
            scale: 2,
            additive: false,
          });
    drag.move({ x: 50, y: 20 }, 7);
    expect(useEditor.getState().preview).not.toBeNull();
    useEditor.getState().interruptGesture();
    expect(drag.active()).toBe(false);
    expect(drag.move({ x: 50, y: 40 }, 7)).toBe(false);
    expect(drag.finish({ x: 50, y: 40 }, 7)).toBe(false);
    expect(useEditor.getState().document).toBe(before);
    expect(useEditor.getState().preview).toBeNull();
    expect(useEditor.getState().past).toHaveLength(0);
  },
);

it("interrupts before the first preview without creating an undo entry", () => {
  const before = useEditor.getState();
  useEditor.setState({ gestureActive: true });
  useEditor.getState().interruptGesture();
  expect(useEditor.getState().document).toBe(before.document);
  expect(useEditor.getState().past).toBe(before.past);
  expect(useEditor.getState().gestureActive).toBe(false);
});

it("explicit Cancel still discards the retained draft", () => {
  useEditor.setState({ hasDraft: true, gestureActive: true });
  useEditor.getState().interruptGesture();
  commands.cancel.bind().run();
  expect(useEditor.getState().hasDraft).toBe(false);
  expect(useEditor.getState().preview).toBeNull();
});

it("switching tools still discards the retained draft", () => {
  useEditor.setState({ hasDraft: true, gestureActive: true });
  useEditor.getState().interruptGesture();
  toolCommands.find((command) => command.id === "line")!.run();
  expect(useEditor.getState().hasDraft).toBe(false);
  expect(useEditor.getState().tool).toBe("line");
});
