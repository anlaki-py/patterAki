import { beforeEach, expect, it } from "vitest";
import { addPath } from "../document/operations";
import { createPieceFromEdge, pieceEdges } from "../document/pieces";
import {
  duplicatePieces,
  pieceBounds,
  applyTransform,
  rotationAround,
  mirrorAround,
} from "../document/pieceTransforms";
import { emptyDocument } from "../document/schema";
import { commands } from "./commands";
import { previewPieceRotation, selectedPieceIds } from "./pieceCommands";
import { beginSelectionDrag } from "./selectionDrag";
import { commitTranslation } from "./movement";
import { useEditor } from "./store";

let n = 0;
const id = () => `workflow-${++n}`;
beforeEach(() => {
  n = 0;
  let doc = addPath(
    emptyDocument("workflows"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ],
    true,
    id,
  );
  doc = createPieceFromEdge(
    doc,
    Object.keys(doc.segments)[0],
    "front",
    "Front",
  );
  doc = duplicatePieces(doc, ["front"], id, { x: 200, y: 20 }).document;
  useEditor.getState().load(doc);
  useEditor.setState({ tool: "select", ready: true });
});

function click(edgeId: string, additive = false, scale = 2) {
  const p = { x: 50, y: 0 };
  beginSelectionDrag({
    itemId: edgeId,
    point: p,
    pointer: 1,
    scale,
    additive,
  }).finish(p, 1);
}

it.each([0.5, 2, 8])(
  "Shift and box selection move both pieces together at %s px/mm",
  (scale) => {
    const doc = useEditor.getState().document;
    const pieces = Object.values(doc.pieces);
    click(pieces[0].rootSegmentId, false, scale);
    click(pieces[1].rootSegmentId, true, scale);
    expect(selectedPieceIds()).toHaveLength(2);
    click(pieces[1].rootSegmentId, true, scale);
    expect(selectedPieceIds()).toEqual(["front"]);
    beginSelectionDrag({
      point: { x: -10, y: -10 },
      pointer: 2,
      scale,
      additive: false,
    }).finish({ x: 310, y: 110 }, 2);
    expect(selectedPieceIds()).toHaveLength(2);
    expect(useEditor.getState().past).toHaveLength(0);

    const drag = beginSelectionDrag({
      itemId: pieces[1].rootSegmentId,
      point: { x: 250, y: 20 },
      pointer: 3,
      scale,
      additive: false,
    });
    drag.move({ x: 270, y: 35 }, 3);
    expect(useEditor.getState().document).toBe(doc);
    drag.finish({ x: 275, y: 32 }, 3);
    for (const [id, p] of Object.entries(doc.points))
      expect(useEditor.getState().document.points[id]).toEqual({
        ...p,
        x: p.x + 25,
        y: p.y + 12,
      });
    expect(useEditor.getState().past).toHaveLength(1);
    const moved = useEditor.getState().document;
    commands.undo.run();
    expect(useEditor.getState().document).toEqual(doc);
    commands.redo.run();
    expect(useEditor.getState().document).toEqual(moved);
  },
);

it("command rotation and both mirrors use the combined pivot, cancel safely and commit once", () => {
  commands.selectAll.run();
  const doc = useEditor.getState().document;
  const bounds = pieceBounds(doc, selectedPieceIds());
  const pivot = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
  };
  previewPieceRotation(37);
  for (const [id, p] of Object.entries(doc.points))
    expect(useEditor.getState().preview!.points[id]).toEqual(
      applyTransform(rotationAround(37, pivot), p),
    );
  commands.cancel.run();
  expect(useEditor.getState().document).toBe(doc);
  expect(useEditor.getState().past).toHaveLength(0);
  for (const axis of ["x", "y"] as const) {
    commands.selectAll.run();
    commands.mirrorPiece.run(axis);
    for (const [id, p] of Object.entries(doc.points))
      expect(useEditor.getState().document.points[id]).toEqual(
        applyTransform(mirrorAround(axis, pivot), p),
      );
    expect(useEditor.getState().past).toHaveLength(1);
    commands.undo.run();
    expect(useEditor.getState().document).toEqual(doc);
  }
});

it("batch duplication preserves spacing and copies can be locked, hidden and recovered without affecting sources", () => {
  commands.selectAll.run();
  const doc = useEditor.getState().document;
  commands.duplicatePiece.run();
  const copied = useEditor.getState().document;
  const copyIds = selectedPieceIds();
  expect(copyIds).toHaveLength(2);
  expect(useEditor.getState().past).toHaveLength(1);
  const originals = Object.values(doc.pieces);
  for (const [index, pieceId] of copyIds.entries()) {
    const sourceBounds = pieceBounds(doc, [originals[index].id]);
    const copyBounds = pieceBounds(copied, [pieceId]);
    expect(copyBounds.min).toEqual({
      x: sourceBounds.min.x + 10,
      y: sourceBounds.min.y + 10,
    });
    expect(
      pieceEdges(copied, copied.pieces[pieceId]).some(
        (edgeId) => !!doc.segments[edgeId],
      ),
    ).toBe(false);
  }
  commands.setSelectedPieceState.run({ locked: true });
  expect(useEditor.getState().selected).toEqual([]);
  commands.selectAll.run();
  expect(selectedPieceIds()).toEqual(originals.map((piece) => piece.id));
  for (const pieceId of copyIds)
    commands.updatePiece.run({ id: pieceId, patch: { locked: false } });
  useEditor.setState({
    selected: copyIds.flatMap((pieceId) =>
      pieceEdges(copied, copied.pieces[pieceId]),
    ),
  });
  commands.setSelectedPieceState.run({ visible: false });
  expect(useEditor.getState().selected).toEqual([]);
  commands.selectAll.run();
  expect(selectedPieceIds()).toEqual(originals.map((piece) => piece.id));
  for (const pieceId of copyIds)
    commands.updatePiece.run({ id: pieceId, patch: { visible: true } });
  expect(useEditor.getState().document).toEqual(copied);
  for (const [id, p] of Object.entries(doc.points))
    expect(copied.points[id]).toEqual(p);
});

it("out-of-range group movement rejects every piece and clears the preview", () => {
  commands.selectAll.run();
  const doc = useEditor.getState().document;
  const drag = beginSelectionDrag({
    itemId: doc.pieces.front.rootSegmentId,
    point: { x: 50, y: 0 },
    pointer: 4,
    scale: 2,
    additive: false,
  });
  expect(() => drag.finish({ x: 2e7, y: 0 }, 4)).toThrow("coordinate range");
  expect(useEditor.getState().document).toBe(doc);
  expect(useEditor.getState().past).toHaveLength(0);
  expect(useEditor.getState().preview).toBeNull();
});

it("attaching selects the whole parent so the next exact move carries outline and internal path", () => {
  const before = useEditor.getState().document;
  const doc = addPath(
    before,
    [
      { x: 20, y: 20 },
      { x: 70, y: 40 },
    ],
    false,
    id,
  );
  const internal = Object.keys(doc.segments).at(-1)!;
  useEditor.getState().load(doc);
  useEditor.setState({ selected: [internal] });
  expect(commands.attachInternalPath.enabled("front")).toBe(true);
  commands.attachInternalPath.run("front");
  const attached = useEditor.getState().document;
  expect(useEditor.getState().past).toHaveLength(1);
  expect(useEditor.getState().selected).toEqual(
    pieceEdges(attached, attached.pieces.front),
  );
  expect(useEditor.getState().editPieceId).toBeNull();
  expect(attached.points).toEqual(doc.points);
  expect(attached.segments).toEqual(doc.segments);
  expect(commands.attachInternalPath.enabled("front")).toBe(false);
  commitTranslation({ x: -12.5, y: 7 });
  const moving = new Set(
    pieceEdges(attached, attached.pieces.front).flatMap((edge) => [
      attached.segments[edge].from,
      attached.segments[edge].to,
    ]),
  );
  for (const [id, p] of Object.entries(doc.points))
    expect(useEditor.getState().document.points[id]).toEqual(
      moving.has(id) ? { ...p, x: p.x - 12.5, y: p.y + 7 } : p,
    );
  commands.undo.run();
  expect(useEditor.getState().document).toEqual(attached);
  commands.undo.run();
  expect(useEditor.getState().document).toEqual(doc);
});

it("attachment disables unavailable parents and non-loose selections; disconnected paths fail atomically", () => {
  let doc = useEditor.getState().document;
  doc = addPath(
    doc,
    [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
    ],
    false,
    id,
  );
  doc = addPath(
    doc,
    [
      { x: 10, y: 40 },
      { x: 30, y: 40 },
    ],
    false,
    id,
  );
  const edges = Object.keys(doc.segments).slice(-2);
  useEditor.getState().load(doc);
  useEditor.setState({ selected: edges });
  expect(() => commands.attachInternalPath.run("front")).toThrow("connected");
  expect(useEditor.getState().document).toBe(doc);
  expect(useEditor.getState().selected).toEqual(edges);
  expect(useEditor.getState().past).toHaveLength(0);
  for (const patch of [{ locked: true }, { visible: false }]) {
    useEditor.getState().load({
      ...doc,
      pieces: { ...doc.pieces, front: { ...doc.pieces.front, ...patch } },
    });
    useEditor.setState({ selected: [edges[0]] });
    expect(commands.attachInternalPath.enabled("front")).toBe(false);
  }
  useEditor.getState().load(doc);
  for (const selection of [[], ["missing"], [doc.pieces.front.rootSegmentId]]) {
    useEditor.setState({ selected: selection });
    expect(commands.attachInternalPath.enabled("front")).toBe(false);
  }
});
