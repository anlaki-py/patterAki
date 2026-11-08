import { beforeEach, expect, it } from "vitest";
import { emptyDocument } from "../document/schema";
import { addPath } from "../document/operations";
import { useEditor } from "./store";
import { toolCommands } from "./commands";
import { findPointInsertion, insertPointAt } from "./pointTool";
beforeEach(() => {
  let id = 0;
  useEditor.getState().load(
    addPath(
      emptyDocument("test"),
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      false,
      () => String(++id),
    ),
  );
  toolCommands.find((command) => command.id === "point")!.run();
});
it("exposes Add point with shortcut X", () => {
  expect(toolCommands.find((tool) => tool.id === "point")).toMatchObject({
    label: "Add point",
    shortcut: "X",
  });
});
it("projects onto the edge and inserts one undoable vertex", () => {
  const original = useEditor.getState().document;
  expect(findPointInsertion(original, { x: 25, y: 2 }, 4)?.point).toEqual({
    x: 25,
    y: 0,
  });
  expect(insertPointAt({ x: 25, y: 2 }, 4)).toBe(true);
  const s = useEditor.getState();
  expect(Object.values(s.document.points)).toContainEqual({ x: 25, y: 0 });
  expect(Object.keys(s.document.segments)).toHaveLength(2);
  expect(s.tool).toBe("point");
  expect(s.past).toHaveLength(1);
  s.undo();
  expect(useEditor.getState().document).toEqual(original);
  s.redo();
  expect(Object.keys(useEditor.getState().document.points)).toHaveLength(3);
});
it("does not create standalone points or duplicate endpoints", () => {
  expect(insertPointAt({ x: 50, y: 30 }, 4)).toBe(false);
  expect(insertPointAt({ x: 0, y: 0 }, 4)).toBe(false);
  expect(insertPointAt({ x: 100, y: 0 }, 4)).toBe(false);
  expect(useEditor.getState().past).toHaveLength(0);
});
it("does not insert again at an already split point", () => {
  insertPointAt({ x: 25, y: 0 }, 4);
  expect(insertPointAt({ x: 25, y: 0 }, 4)).toBe(false);
  expect(useEditor.getState().past).toHaveLength(1);
});
it("respects the zoom-adjusted hit radius", () => {
  const doc = useEditor.getState().document;
  expect(findPointInsertion(doc, { x: 25, y: 3 }, 9 / 2)).toBeDefined();
  expect(findPointInsertion(doc, { x: 25, y: 3 }, 9 / 4)).toBeUndefined();
});
