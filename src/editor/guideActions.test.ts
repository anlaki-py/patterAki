import { beforeEach, expect, it } from "vitest";
import {
  commitGuideMove,
  createGuide,
  offsetGuide,
  removeGuide,
  setGuideLocked,
  setGuidePosition,
  setGuideVisible,
} from "./guideActions";
import { useEditor } from "./store";
import { emptyDocument } from "../document/schema";

beforeEach(() => {
  useEditor.getState().load(emptyDocument("guides"));
});

it("creates, offsets, hides, locks and deletes guides as single history entries", () => {
  const id = createGuide("x", -12.5, "g1");
  expect(useEditor.getState().document.guides.g1).toMatchObject({
    axis: "x",
    positionMm: -12.5,
    locked: false,
    visible: true,
  });
  expect(useEditor.getState().selectedGuide).toBe(id);
  expect(useEditor.getState().past).toHaveLength(1);

  setGuidePosition(id, 42.25);
  expect(useEditor.getState().document.guides.g1.positionMm).toBe(42.25);
  offsetGuide(id, 2.5);
  expect(useEditor.getState().document.guides.g1.positionMm).toBe(44.75);
  expect(useEditor.getState().past).toHaveLength(3);

  setGuideVisible(id, false);
  setGuideLocked(id, true);
  expect(useEditor.getState().document.guides.g1).toMatchObject({
    visible: false,
    locked: true,
  });
  removeGuide(id);
  expect(useEditor.getState().document.guides).toEqual({});
  expect(useEditor.getState().past).toHaveLength(6);

  useEditor.getState().undo();
  expect(useEditor.getState().document.guides.g1).toMatchObject({
    visible: false,
    locked: true,
  });
  useEditor.getState().redo();
  expect(useEditor.getState().document.guides).toEqual({});
});

it("R03 commits one exact drag entry and rejects locked or stale guide moves", () => {
  const id = createGuide("y", 10, "h");
  const base = useEditor.getState().document;
  commitGuideMove(base, id, 12.5);
  expect(useEditor.getState().document.guides.h.positionMm).toBe(12.5);
  expect(useEditor.getState().past).toHaveLength(2);

  setGuideLocked(id, true);
  const lockedBase = useEditor.getState().document;
  expect(() => commitGuideMove(lockedBase, id, 20)).toThrow("Unlock");
  expect(useEditor.getState().document).toBe(lockedBase);
  expect(() => commitGuideMove(base, id, 20)).toThrow("changed");
  expect(useEditor.getState().document).toBe(lockedBase);
});

it("rejects invalid guide positions without adding history", () => {
  const id = createGuide("x", 0, "bad");
  const base = useEditor.getState().document;
  expect(() => setGuidePosition(id, Number.NaN)).toThrow();
  expect(() => offsetGuide(id, Number.POSITIVE_INFINITY)).toThrow();
  expect(useEditor.getState().document).toBe(base);
  expect(useEditor.getState().past).toHaveLength(1);
});
