import { beforeEach, expect, it } from "vitest";
import { commands } from "./commands";
import { useEditor } from "./store";
import { emptyDocument } from "../document/schema";
import { addEllipse } from "../document/ellipse";
let n = 0;
const id = () => `command-sew-${++n}`;
beforeEach(() => {
  useEditor
    .getState()
    .load(addEllipse(emptyDocument("sewing-commands"), 0, 0, 100, 200, id));
});
it("sewing edits create one history entry, undo/redo retain all records and stale previews cannot overwrite", () => {
  const s = useEditor.getState(),
    pieceId = Object.keys(s.document.pieces)[0];
  commands.updateSewing
    .bind({
      pieceId,
      change: (s) => ({
        ...s,
        darts: [
          {
            id: id(),
            center: { x: 50, y: 20 },
            rotation: 0,
            intakeMm: 20,
            depthMm: 100,
          },
        ],
      }),
    })
    .run();
  expect(useEditor.getState().past).toHaveLength(1);
  const committed = useEditor.getState().document;
  useEditor.getState().undo();
  expect(useEditor.getState().document.pieces[pieceId].sewing).toBeUndefined();
  useEditor.getState().redo();
  expect(useEditor.getState().document).toEqual(committed);
  expect(
    commands.applySewingPreview
      .bind({ base: s.document, candidate: s.document })
      .enabled(),
  ).toBe(false);
  commands.applySewingPreview
    .bind({ base: s.document, candidate: s.document })
    .run();
  expect(useEditor.getState().document).toEqual(committed);
});
it("invalid or locked sewing edits never add history or replace geometry", () => {
  const s = useEditor.getState(),
    pieceId = Object.keys(s.document.pieces)[0];
  expect(() =>
    commands.updateSewing
      .bind({
        pieceId,
        change: (s) => ({
          ...s,
          notches: [
            {
              id: id(),
              segmentId: "missing",
              fraction: 0.5,
              style: "single",
              depthMm: 3,
            },
          ],
        }),
      })
      .run(),
  ).toThrow();
  expect(useEditor.getState().document).toBe(s.document);
  expect(useEditor.getState().past).toHaveLength(0);
  const locked = structuredClone(s.document);
  locked.pieces[pieceId].locked = true;
  useEditor.getState().load(locked);
  expect(
    commands.updateSewing.bind({ pieceId, change: (s) => s }).enabled(),
  ).toBe(false);
});
