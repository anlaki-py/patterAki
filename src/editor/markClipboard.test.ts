import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { notifications } from "@mantine/notifications";
import { newAnnotation, putAnnotation } from "../document/annotations";
import { addPath } from "../document/operations";
import { emptyDocument } from "../document/schema";
import { commands, dispatchShortcut, editCommands } from "./commands";
import { useEditor } from "./store";

beforeEach(() => {
  let seq = 0;
  let doc = addPath(
    emptyDocument("clipboard"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    false,
    () => `edge-${++seq}`,
  );
  doc = putAnnotation(doc, {
    ...newAnnotation("button", { x: 20, y: 40 }, "button"),
    rotation: 23,
  });
  doc = putAnnotation(
    doc,
    newAnnotation("buttonhole", { x: 60, y: 80 }, "hole"),
  );
  useEditor.getState().load(doc);
  useEditor.setState({
    selected: ["button"],
    tool: "select",
    markClipboard: null,
    activePoint: null,
  });
});
afterEach(() => vi.restoreAllMocks());
it("copy leaves history/revision unchanged; repeated paste offsets and selects independent copies", () => {
  const before = useEditor.getState();
  commands.copyMarks.run();
  expect(useEditor.getState().document).toBe(before.document);
  expect(useEditor.getState().revision).toBe(before.revision);
  expect(useEditor.getState().past).toHaveLength(0);
  commands.pasteMarks.run(undefined);
  let s = useEditor.getState();
  const first = s.selected[0];
  expect(s.document.annotations[first]).toEqual({
    ...before.document.annotations.button,
    id: first,
    position: { x: 30, y: 50 },
  });
  expect(s.past).toHaveLength(1);
  commands.pasteMarks.run(undefined);
  s = useEditor.getState();
  expect(s.selected).toHaveLength(1);
  expect(s.selected[0]).not.toBe(first);
  expect(s.document.annotations[s.selected[0]].position).toEqual({
    x: 40,
    y: 60,
  });
  expect(s.past).toHaveLength(2);
  const result = s.document;
  s.undo();
  expect(
    useEditor.getState().document.annotations[s.selected[0]],
  ).toBeUndefined();
  useEditor.getState().redo();
  expect(useEditor.getState().document).toEqual(result);
});
it("copies across project switches in the same session, with original dimensions", () => {
  const source = useEditor.getState().document.annotations.button;
  commands.copyMarks.run();
  useEditor.getState().load({ ...emptyDocument("target"), unitsDisplay: "in" });
  commands.pasteMarks.run(undefined);
  const s = useEditor.getState(),
    copy = s.document.annotations[s.selected[0]];
  expect(copy).toEqual({ ...source, id: copy.id, position: { x: 30, y: 50 } });
  expect(s.document.id).toBe("target");
  expect(s.past).toHaveLength(1);
});
it("duplicates the current mark without replacing the copied mark or changing its paste counter", () => {
  commands.copyMarks.run();
  const clipboard = useEditor.getState().markClipboard;
  useEditor.setState({ selected: ["hole"] });
  commands.duplicateMarks.run();
  const s = useEditor.getState(),
    duplicate = s.document.annotations[s.selected[0]];
  expect(duplicate.kind).toBe("buttonhole");
  expect(duplicate.position).toEqual({ x: 70, y: 90 });
  expect(s.markClipboard).toBe(clipboard);
  expect(s.past).toHaveLength(1);
});
it("cut is one undoable edit and retains a pasteable snapshot, without touching lines", () => {
  const before = useEditor.getState().document;
  useEditor.setState({
    selected: ["button", "hole"],
    activePoint: Object.keys(before.points)[0],
  });
  commands.cutMarks.run();
  const cut = useEditor.getState();
  expect(cut.document.annotations).toEqual({});
  expect(cut.document.points).toEqual(before.points);
  expect(cut.document.segments).toEqual(before.segments);
  expect(cut.past).toHaveLength(1);
  expect(cut.activePoint).toBeNull();
  cut.undo();
  expect(useEditor.getState().document).toEqual(before);
  commands.pasteMarks.run(undefined);
  expect(useEditor.getState().selected).toHaveLength(2);
  expect(Object.keys(useEditor.getState().document.annotations)).toHaveLength(
    4,
  );
});
it("pastes a group at the requested location with its relative positions intact", () => {
  useEditor.setState({ selected: ["button", "hole"] });
  commands.copyMarks.run();
  commands.pasteMarks.run({ x: 300, y: 400 });
  const s = useEditor.getState();
  expect(s.document.annotations[s.selected[0]].position).toEqual({
    x: 300,
    y: 400,
  });
  expect(s.document.annotations[s.selected[1]].position).toEqual({
    x: 340,
    y: 440,
  });
});
it("copies marks from a mixed selection while preserving lines, and refuses active edits", () => {
  const doc = useEditor.getState().document;
  useEditor.setState({ selected: ["button", Object.keys(doc.segments)[0]] });
  expect(commands.copyMarks.enabled()).toBe(true);
  commands.copyMarks.run();
  expect(useEditor.getState().markClipboard?.marks.map((m) => m.id)).toEqual([
    "button",
  ]);
  commands.cutMarks.run();
  expect(useEditor.getState().document.segments).toEqual(doc.segments);
  expect(useEditor.getState().document.points).toEqual(doc.points);
  expect(useEditor.getState().document.annotations.button).toBeUndefined();
  const cut = useEditor.getState().document,
    past = useEditor.getState().past.length;
  useEditor.setState({ selected: ["hole"], preview: cut });
  for (const command of [
    commands.copyMarks,
    commands.cutMarks,
    commands.duplicateMarks,
  ]) {
    expect(command.enabled()).toBe(false);
    command.run();
  }
  expect(commands.pasteMarks.enabled(undefined)).toBe(false);
  commands.pasteMarks.run(undefined);
  expect(useEditor.getState().document).toBe(cut);
  expect(useEditor.getState().past).toHaveLength(past);
});
it("reports paste failures while preserving the clipboard, selection, document and history", () => {
  const show = vi.spyOn(notifications, "show");
  commands.copyMarks.run();
  const before = useEditor.getState();
  commands.pasteMarks.run({ x: 1e7, y: 0 });
  const after = useEditor.getState();
  expect(show).toHaveBeenCalledWith(
    expect.objectContaining({
      color: "red",
      message: expect.stringContaining("coordinate range"),
    }),
  );
  expect(after.document).toBe(before.document);
  expect(after.selected).toEqual(before.selected);
  expect(after.markClipboard).toBe(before.markClipboard);
  expect(after.past).toHaveLength(0);
});
it.each([false, true])(
  "dispatches mark copy/paste using the %s meta modifier",
  (meta) => {
    const key = (value: string) => ({
      key: value,
      ctrlKey: !meta,
      metaKey: meta,
      shiftKey: false,
      altKey: false,
      isComposing: false,
      defaultPrevented: false,
      target: null,
      preventDefault: vi.fn(),
    });
    expect(dispatchShortcut(key("c"), editCommands)).toBe(true);
    expect(dispatchShortcut(key("v"), editCommands)).toBe(true);
    expect(useEditor.getState().past).toHaveLength(1);
    expect(
      useEditor.getState().document.annotations[
        useEditor.getState().selected[0]
      ].kind,
    ).toBe("button");
  },
);

it("skips an occupied default paste position after Duplicate without changing the copied mark", () => {
  commands.copyMarks.run();
  commands.duplicateMarks.run();
  commands.pasteMarks.run(undefined);
  const s = useEditor.getState();
  expect(s.document.annotations[s.selected[0]].position).toEqual({
    x: 40,
    y: 60,
  });
  expect(s.markClipboard?.marks[0].id).toBe("button");
  expect(s.markClipboard?.pasteCount).toBe(2);
});

it("duplicates the original repeatedly without stacking copies at one position", () => {
  commands.copyMarks.run();
  const clipboard = useEditor.getState().markClipboard;
  commands.duplicateMarks.run();
  useEditor.setState({ selected: ["button"] });
  commands.duplicateMarks.run();
  const s = useEditor.getState();
  expect(s.document.annotations[s.selected[0]].position).toEqual({
    x: 40,
    y: 60,
  });
  expect(s.past).toHaveLength(2);
  expect(s.markClipboard).toBe(clipboard);
});
