import { beforeEach, expect, it } from "vitest";
import { addPath } from "../document/operations";
import { createPieceFromEdge, pieceEdges } from "../document/pieces";
import { emptyDocument } from "../document/schema";
import { beginSelectionDrag } from "./selectionDrag";
import { resolveGroupMovement, type MovementSnapOptions } from "./movement";
import { defaultSettings } from "./settings";
import { useEditor } from "./store";

let next = 0;
const id = () => `g-${++next}`;
const makePiece = () => {
  next = 0;
  const doc = addPath(
    emptyDocument("gesture"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ],
    true,
    id,
  );
  return createPieceFromEdge(doc, Object.keys(doc.segments)[0], "piece-one");
};
const options: MovementSnapOptions = {
  scale: 2,
  touch: false,
  alt: false,
  snap: true,
  grid: false,
  modes: { ...defaultSettings.snapModes, alignments: false },
  gridSpacingMm: 10,
  mouseRadiusPx: 8,
  touchRadiusPx: 16,
  releaseMultiplier: 1.5,
  showGuides: true,
  snapGuides: true,
};
beforeEach(() => useEditor.getState().load(emptyDocument("gesture")));

it("P09 clicking a piece edge selects all members, drags with a preview and creates one undo entry", () => {
  const doc = makePiece();
  useEditor.getState().load(doc);
  const first = Object.keys(doc.segments)[0];
  const selectedIds = pieceEdges(doc, doc.pieces["piece-one"]);
  const gesture = beginSelectionDrag({
    itemId: first,
    point: { x: 50, y: 0 },
    pointer: 13,
    scale: 2,
    additive: false,
  });
  expect(useEditor.getState().selected).toEqual(selectedIds);
  gesture.move({ x: 66, y: 9 }, 13);
  expect(useEditor.getState().preview).toBeTruthy();
  expect(useEditor.getState().past).toHaveLength(0);
  gesture.finish({ x: 66, y: 9 }, 13);
  expect(useEditor.getState().past).toHaveLength(1);
  for (const [pid, point] of Object.entries(doc.points)) {
    expect(useEditor.getState().document.points[pid]).toEqual({
      x: point.x + 16,
      y: point.y + 9,
    });
  }
  useEditor.getState().undo();
  expect(useEditor.getState().document).toEqual(doc);
});

it("P10 piece drag uses the shared snap resolver, excludes itself and previews applied X/Y delta", () => {
  let doc = makePiece();
  doc = addPath(
    doc,
    [
      { x: 140, y: 30 },
      { x: 140, y: 60 },
    ],
    false,
    id,
  );
  useEditor.getState().load(doc);
  const first = doc.pieces["piece-one"].rootSegmentId;
  const gesture = beginSelectionDrag({
    itemId: first,
    point: { x: 50, y: 0 },
    pointer: 2,
    scale: 2,
    additive: false,
    resolve: ({ base, selected, anchor, target, axisLock, altKey }) => {
      const result = resolveGroupMovement(base, selected, anchor, target, {
        ...options,
        axisLock,
        alt: altKey,
      });
      return {
        delta: result.delta,
        preview: result.preview,
        issue: result.issue,
        info: null,
      };
    },
  });
  gesture.move({ x: 140.5, y: 29.5 }, 2);
  expect(gesture.delta).toEqual({ x: 90, y: 30 });
  expect(useEditor.getState().preview).toBeTruthy();
  gesture.finish({ x: 140.5, y: 29.5 }, 2);
  expect(useEditor.getState().past).toHaveLength(1);
});
