import { expect, it } from "vitest";
import { exactDraftEndpoint, rectangleDimensions } from "./draftInput";
import { distance } from "../geometry/line";
import { autoPanDelta } from "./autoPan";
it("keeps explicit exact lengths and angles independent of grid or display units", () => {
  const start = { x: 13, y: 27 };
  const end = exactDraftEndpoint(start, "125 mm", 30, 10);
  expect(distance(start, end)).toBeCloseTo(125, 12);
  expect(rectangleDimensions("180 mm", "24 cm", 25.4)).toEqual({
    width: 180,
    height: 240,
  });
  expect(() => exactDraftEndpoint(start, "0", 0, 1)).toThrow();
  expect(() => exactDraftEndpoint(start, "1", "", 1)).toThrow();
  expect(() => rectangleDimensions("", 10, 1)).toThrow();
});
it("pans proportionally near borders, stops away from edges and caps delayed frames", () => {
  const size = { width: 800, height: 600 };
  expect(autoPanDelta({ x: 400, y: 300 }, size, 16)).toEqual({ x: 0, y: 0 });
  expect(autoPanDelta({ x: 0, y: 300 }, size, 1000)).toEqual({ x: 15, y: 0 });
  expect(autoPanDelta({ x: 800, y: 600 }, size, 10)).toEqual({ x: -3, y: -3 });
  expect(autoPanDelta({ x: -1, y: -1 }, size, 16)).toEqual({ x: 0, y: 0 });
});

it("Line remains straight despite pointer drags or leftover tangents, at every zoom", async () => {
  const { createDraftDocument, draftTangent } = await import("./draftInput");
  const { emptyDocument } = await import("../document/schema");
  const { useEditor } = await import("./store");
  const a = { x: 0, y: 0 },
    b = { x: 100, y: 0 };
  for (const scale of [0.5, 2, 8]) {
    expect(draftTangent("line", a, { x: 20, y: 15 }, scale)).toBeNull();
    let n = 0;
    const doc = createDraftDocument(
      emptyDocument("straight"),
      "line",
      [a, b],
      false,
      new Map([
        [0, { x: 20, y: 15 }],
        [1, { x: 10, y: 20 }],
      ]),
      () => `line-${++n}`,
    );
    expect(Object.values(doc.segments)[0].kind).toBe("line");
    expect(Object.values(doc.points)).toEqual([a, b]);
    useEditor.getState().load(emptyDocument("straight"));
    useEditor.getState().commit(doc);
    expect(useEditor.getState().past).toHaveLength(1);
    useEditor.getState().undo();
    expect(Object.keys(useEditor.getState().document.segments)).toHaveLength(0);
    useEditor.getState().redo();
    expect(useEditor.getState().document).toEqual(doc);
  }
});
it("Polyline supports deliberate drag-created curves without reshaping pre-existing nearby lines", async () => {
  const { createDraftDocument, draftTangent } = await import("./draftInput");
  const { emptyDocument } = await import("../document/schema");
  let n = 0;
  const id = () => `draft-${++n}`;
  const a = { x: 0, y: 0 },
    b = { x: 100, y: 0 };
  expect(draftTangent("polyline", a, { x: 1, y: 0 }, 2)).toBeNull();
  expect(draftTangent("polyline", a, { x: 10, y: 10 }, 2)).toEqual({
    x: 10,
    y: 10,
  });
  const original = createDraftDocument(
    emptyDocument("curves"),
    "line",
    [a, b],
    false,
    new Map(),
    id,
  );
  const next = createDraftDocument(
    original,
    "polyline",
    [a, { x: 0, y: 100 }],
    false,
    new Map([[0, { x: 20, y: 10 }]]),
    id,
  );
  const oldId = Object.keys(original.segments)[0];
  expect(next.segments[oldId]).toEqual(original.segments[oldId]);
  expect(Object.values(next.segments).at(-1)?.kind).toBe("cubic");
});
