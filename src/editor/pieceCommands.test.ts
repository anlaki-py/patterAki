import { beforeEach, expect, it } from "vitest";
import { addPath } from "../document/operations";
import { createPieceFromEdge, pieceEdges } from "../document/pieces";
import { emptyDocument } from "../document/schema";
import { commands, toolCommands } from "./commands";
import { selectedPieceIds, previewPieceRotation } from "./pieceCommands";
import { beginSelectionDrag } from "./selectionDrag";
import { useEditor } from "./store";
import { fitSelectionView } from "./fitView";
import { resolveSnapDetailed } from "./snapResolver";
import { defaultSettings } from "./settings";
import { SvgGeometry } from "./SvgGeometry";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
let n = 0;
const id = () => `pc-${++n}`;
beforeEach(() => {
  n = 0;
  let doc = addPath(
    emptyDocument("piece-editor"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ],
    true,
    id,
  );
  doc = createPieceFromEdge(doc, Object.keys(doc.segments)[0], "piece");
  useEditor.getState().load(doc);
  useEditor.setState({ ready: true });
  commands.selectPiece.run("piece");
});
it("rotation preview cancels without history or save changes; apply and undo/redo are a single transaction", () => {
  const before = useEditor.getState().document;
  previewPieceRotation(37);
  expect(useEditor.getState().document).toBe(before);
  expect(useEditor.getState().past).toHaveLength(0);
  expect(useEditor.getState().preview).not.toEqual(before);
  useEditor.getState().cancel();
  expect(useEditor.getState().document).toBe(before);
  expect(useEditor.getState().preview).toBeNull();
  previewPieceRotation(90);
  const preview = useEditor.getState().preview!;
  useEditor.getState().commit(preview);
  expect(useEditor.getState().past).toHaveLength(1);
  useEditor.getState().undo();
  expect(useEditor.getState().document).toEqual(before);
  useEditor.getState().redo();
  expect(useEditor.getState().document).toEqual(preview);
});
it("rename and metadata validation preserve geometry and reject empty names in one transaction", () => {
  const doc = useEditor.getState().document;
  commands.updatePiece.run({
    id: "piece",
    patch: {
      name: "Front",
      metadata: {
        ...doc.pieces.piece.metadata,
        cutQuantity: 2,
        size: "M",
        fabric: "Linen",
        notes: "Cut mirrored",
      },
    },
  });
  expect(useEditor.getState().document.points).toEqual(doc.points);
  expect(useEditor.getState().past).toHaveLength(1);
  const valid = useEditor.getState().document;
  expect(() =>
    commands.updatePiece.run({ id: "piece", patch: { name: " " } }),
  ).toThrow();
  expect(useEditor.getState().document).toBe(valid);
  expect(useEditor.getState().past).toHaveLength(1);
});
it("duplicate selects independent copies, mirrors in one step and undoes without changing source", () => {
  const doc = useEditor.getState().document;
  commands.duplicatePiece.run();
  expect(useEditor.getState().past).toHaveLength(1);
  const copies = selectedPieceIds();
  expect(copies).toHaveLength(1);
  expect(copies[0]).not.toBe("piece");
  commands.mirrorPiece.run("x");
  expect(useEditor.getState().past).toHaveLength(2);
  for (const [id, p] of Object.entries(doc.points))
    expect(useEditor.getState().document.points[id]).toEqual(p);
  useEditor.getState().undo();
  useEditor.getState().undo();
  expect(useEditor.getState().document).toEqual(doc);
});
it("Edit points and Select piece keep the saved parent through individual edge selection and reshaping", () => {
  commands.editPiece.run();
  let s = useEditor.getState();
  const edgeId = s.document.pieces.piece.stitchingOutline[1].segmentId;
  expect(s.editPieceId).toBe("piece");
  const drag = beginSelectionDrag({
    itemId: edgeId,
    point: { x: 100, y: 40 },
    pointer: 5,
    scale: 2,
    additive: false,
  });
  expect(useEditor.getState().selected).toEqual([edgeId]);
  drag.finish({ x: 105, y: 40 }, 5);
  s = useEditor.getState();
  expect(s.editPieceId).toBe("piece");
  expect(s.document.pieces.piece.stitchingOutline).toHaveLength(4);
  commands.selectPiece.run("piece");
  expect(useEditor.getState().editPieceId).toBeNull();
  expect(useEditor.getState().selected).toEqual(
    pieceEdges(s.document, s.document.pieces.piece),
  );
  toolCommands.find((c) => c.id === "select")!.run();
  expect(useEditor.getState().editPieceId).toBeNull();
});
it("lock disables transforms, delete and stale geometry commits; unlock restores commands", () => {
  const doc = useEditor.getState().document;
  commands.updatePiece.run({ id: "piece", patch: { locked: true } });
  commands.selectPiece.run("piece");
  expect(commands.duplicatePiece.enabled()).toBe(false);
  expect(commands.mirrorPiece.enabled("x")).toBe(false);
  expect(commands.delete.enabled()).toBe(false);
  const key = Object.keys(doc.points)[0];
  expect(() =>
    useEditor.getState().commit({
      ...useEditor.getState().document,
      points: { ...doc.points, [key]: { x: 1, y: 1 } },
    }),
  ).toThrow("Locked");
  commands.updatePiece.run({ id: "piece", patch: { locked: false } });
  expect(commands.duplicatePiece.enabled()).toBe(true);
});
it("hide removes SVG, hit targets, box/select-all and magnetic snaps without deleting geometry", () => {
  const doc = useEditor.getState().document;
  commands.updatePiece.run({ id: "piece", patch: { visible: false } });
  const hidden = useEditor.getState().document;
  expect(hidden.points).toEqual(doc.points);
  commands.selectAll.run();
  expect(useEditor.getState().selected).toEqual([]);
  const svg = renderToStaticMarkup(
    createElement(SvgGeometry, { doc: hidden, selectedIds: [], scale: 2 }),
  );
  expect(svg).not.toContain("data-edge");
  const resolution = resolveSnapDetailed(
    hidden,
    { x: 0, y: 0 },
    {
      tool: "line",
      scale: 2,
      touch: false,
      panning: false,
      snap: true,
      grid: false,
      bypass: false,
      constrain: false,
      modes: defaultSettings.snapModes,
    },
  );
  expect(resolution.chosen).toBeUndefined();
  commands.updatePiece.run({ id: "piece", patch: { visible: true } });
  expect(useEditor.getState().document.points).toEqual(doc.points);
});
it("fit-selection excludes distant loose geometry and viewport changes never alter dimensions", () => {
  const original = useEditor.getState().document;
  const doc = addPath(
    original,
    [
      { x: 10000, y: 10000 },
      { x: 11000, y: 10000 },
    ],
    false,
    id,
  );
  const ids = pieceEdges(doc, doc.pieces.piece),
    view = fitSelectionView(doc, ids, 800, 600);
  for (const p of Object.values(original.points)) {
    expect(view.x + p.x * view.scale).toBeGreaterThanOrEqual(39.99);
    expect(view.x + p.x * view.scale).toBeLessThanOrEqual(760.01);
    expect(view.y + p.y * view.scale).toBeGreaterThanOrEqual(39.99);
    expect(view.y + p.y * view.scale).toBeLessThanOrEqual(560.01);
  }
  expect(view.scale).toBeGreaterThan(2);
  expect(doc.points).toMatchObject(original.points);
});
