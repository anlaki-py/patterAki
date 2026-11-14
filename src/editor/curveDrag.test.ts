import { beforeEach, describe, expect, it } from "vitest";
import { addPath } from "../document/operations";
import { bendCurve } from "../document/curves";
import { createPieceFromEdge } from "../document/pieces";
import { emptyDocument } from "../document/schema";
import { asCubic, segmentPoint } from "../document/segments";
import { beginCurveDrag } from "./curveDrag";
import { useEditor } from "./store";

function fixture(closed = false) {
  let next = 0;
  return addPath(
    emptyDocument("curve-gesture"),
    closed
      ? [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 80 },
          { x: 0, y: 80 },
        ]
      : [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
    closed,
    () => `curve-${++next}`,
  );
}
const start = { x: 50, y: 0 };
function begin(scale = 2) {
  return beginCurveDrag({
    edgeId: Object.keys(useEditor.getState().document.segments)[0],
    point: start,
    pointer: 1,
    scale,
  })!;
}
beforeEach(() => {
  useEditor.getState().load(fixture());
  useEditor.setState({ tool: "curve" });
});

describe("curve gesture lifecycle", () => {
  it.each([0.5, 2, 8])(
    "a click or pickup jitter leaves straight geometry and history untouched at scale %s",
    (scale) => {
      const before = useEditor.getState();
      const drag = begin(scale);
      expect(useEditor.getState().preview).toBeNull();
      drag.move({ x: 50, y: 2 / scale }, 1);
      drag.finish({ x: 50, y: 2 / scale }, 1);
      expect(useEditor.getState().document).toBe(before.document);
      expect(useEditor.getState().revision).toBe(before.revision);
      expect(useEditor.getState().past).toHaveLength(0);
    },
  );

  it("previews from the original geometry, uses the release position, and commits once", () => {
    const before = useEditor.getState().document;
    const edgeId = Object.keys(before.segments)[0];
    const drag = begin();
    drag.move({ x: 50, y: 10 }, 1);
    drag.move({ x: 50, y: 20 }, 1);
    expect(useEditor.getState().document).toBe(before);
    expect(useEditor.getState().past).toHaveLength(0);
    expect(useEditor.getState().preview).toEqual(
      bendCurve(before, edgeId, 0.5, { x: 0, y: 20 }),
    );
    expect(drag.finish({ x: 50, y: 30 }, 1)).toBe(true);
    const after = useEditor.getState().document;
    expect(after.points).toEqual(before.points);
    expect(segmentPoint(after, after.segments[edgeId], 0.5).y).toBeCloseTo(30);
    expect(useEditor.getState().past).toHaveLength(1);
    expect(drag.finish({ x: 50, y: 40 }, 1)).toBe(false);
    useEditor.getState().undo();
    expect(useEditor.getState().document).toEqual(before);
    useEditor.getState().redo();
    expect(useEditor.getState().document).toEqual(after);
  });

  it("returning to the pickup point leaves a straight edge straight", () => {
    const before = useEditor.getState().document;
    const drag = begin();
    drag.move({ x: 50, y: 20 }, 1);
    drag.finish(start, 1);
    expect(useEditor.getState().document).toBe(before);
    expect(useEditor.getState().preview).toBeNull();
    expect(useEditor.getState().past).toHaveLength(0);
  });

  it("ignores another pointer without ending the owning gesture", () => {
    const drag = begin();
    expect(drag.owns(1)).toBe(true);
    expect(drag.owns(2)).toBe(false);
    expect(drag.move({ x: 50, y: 90 }, 2)).toBe(false);
    expect(drag.finish({ x: 50, y: 90 }, 2)).toBe(false);
    expect(drag.active()).toBe(true);
    expect(useEditor.getState().preview).toBeNull();
    drag.finish({ x: 50, y: 20 }, 1);
    expect(useEditor.getState().past).toHaveLength(1);
  });

  it.each(["cancel", "load", "commit", "tool"] as const)(
    "%s invalidates the gesture synchronously, before React effects",
    (action) => {
      const drag = begin();
      drag.move({ x: 50, y: 20 }, 1);
      const s = useEditor.getState();
      if (action === "cancel") s.cancel();
      if (action === "load") s.load(emptyDocument("other-project"));
      if (action === "commit") s.commit({ ...s.document, name: "Changed" });
      if (action === "tool") useEditor.setState({ tool: "select" });
      const current = useEditor.getState();
      expect(drag.active()).toBe(false);
      expect(drag.finish({ x: 50, y: 30 }, 1)).toBe(false);
      expect(useEditor.getState().document).toBe(current.document);
      expect(useEditor.getState().revision).toBe(current.revision);
    },
  );

  it("rejects an invalid bend and clears its preview without changing history", () => {
    const before = fixture(true);
    useEditor.getState().load(before);
    const drag = begin();
    drag.move({ x: 50, y: 100 }, 1);
    expect(useEditor.getState().previewIssue).toBeTruthy();
    expect(() => drag.finish({ x: 50, y: 100 }, 1)).toThrow();
    expect(useEditor.getState().document).toBe(before);
    expect(useEditor.getState().past).toHaveLength(0);
    expect(useEditor.getState().preview).toBeNull();
  });

  it("preserves the document after out-of-range release coordinates", () => {
    const before = useEditor.getState().document;
    const drag = begin();
    expect(() => drag.finish({ x: 50, y: 1e9 }, 1)).toThrow();
    expect(useEditor.getState().document).toBe(before);
    expect(useEditor.getState().past).toHaveLength(0);
    expect(useEditor.getState().preview).toBeNull();
  });

  it.each(["locked", "hidden"])("refuses a %s piece", (state) => {
    const doc = fixture(true);
    const edgeId = Object.keys(doc.segments)[0];
    const pieceDoc = createPieceFromEdge(doc, edgeId, "piece");
    const piece = pieceDoc.pieces.piece;
    useEditor.getState().load({
      ...pieceDoc,
      pieces: {
        piece: {
          ...piece,
          locked: state === "locked",
          visible: state !== "hidden",
        },
      },
    });
    expect(begin()).toBeNull();
  });

  it("moves handles by their pickup delta without a jump", () => {
    const base = useEditor.getState().document;
    const edgeId = Object.keys(base.segments)[0];
    const doc = bendCurve(base, edgeId, 0.5, { x: 0, y: 20 });
    const original = asCubic(doc, doc.segments[edgeId])[1];
    useEditor.getState().load(doc);
    const pickup = { x: original.x + 1, y: original.y - 1 };
    const drag = beginCurveDrag({
      edgeId,
      handle: "control1",
      point: pickup,
      pointer: 1,
      scale: 2,
    })!;
    drag.finish({ x: pickup.x + 10, y: pickup.y + 5 }, 1);
    const after = useEditor.getState().document;
    expect(asCubic(after, after.segments[edgeId])[1]).toEqual({
      x: original.x + 10,
      y: original.y + 5,
    });
    expect(after.points).toEqual(doc.points);
    expect(useEditor.getState().past).toHaveLength(1);
  });
});
