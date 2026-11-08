import { beforeEach, expect, it } from "vitest";
import { addPath } from "./operations";
import { emptyDocument } from "./schema";
import {
  applyPointPlacement,
  placementAtVertex,
  placementOnEdge,
  splitDistances,
} from "./pointPlacement";
import { useEditor } from "../editor/store";
import { distance } from "../geometry/line";
let next = 0;
const id = () => String(++next);
const line = () =>
  addPath(
    emptyDocument("test"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    false,
    id,
  );
beforeEach(() => {
  next = 0;
});
it("links distances from either end", () => {
  expect(splitDistances(100, 30, "start")).toEqual({
    fromStart: 30,
    fromEnd: 70,
  });
  expect(splitDistances(100, 30, "end")).toEqual({
    fromStart: 70,
    fromEnd: 30,
  });
});
it.each([0, -1, 100, 120, NaN, Infinity])(
  "rejects invalid distances %s",
  (value) => {
    expect(() => splitDistances(100, value, "start")).toThrow();
    expect(() => splitDistances(100, value, "end")).toThrow();
  },
);
it("previews exact insertion without modifying original geometry", () => {
  const doc = line(),
    edge = Object.values(doc.segments)[0];
  const target = placementOnEdge(doc, edge.id, 0.5, {
    pointId: "new-point",
    newEdgeId: "new-edge",
  });
  const preview = applyPointPlacement(doc, target, 30);
  expect(preview.points["new-point"]).toEqual({ x: 30, y: 0 });
  expect(Object.keys(doc.points)).toHaveLength(2);
  expect(preview.points[edge.from]).toEqual(doc.points[edge.from]);
  expect(preview.points[edge.to]).toEqual(doc.points[edge.to]);
});
it("can reposition an inserted point using either neighbour without adding more vertices", () => {
  const doc = line(),
    edge = Object.values(doc.segments)[0];
  const inserted = applyPointPlacement(
    doc,
    placementOnEdge(doc, edge.id, 0.5, {
      pointId: "new-point",
      newEdgeId: "new-edge",
    }),
    30,
  );
  const target = placementAtVertex(inserted, "new-point");
  const updated = applyPointPlacement(
    inserted,
    target,
    splitDistances(100, 20, "end").fromStart,
  );
  expect(updated.points["new-point"]).toEqual({ x: 80, y: 0 });
  expect(Object.keys(updated.points)).toHaveLength(3);
  expect(Object.keys(updated.segments)).toHaveLength(2);
});
it("preserves exact distances on a diagonal", () => {
  const doc = addPath(
    emptyDocument("test"),
    [
      { x: 0, y: 0 },
      { x: 60, y: 80 },
    ],
    false,
    id,
  );
  const target = placementOnEdge(doc, Object.keys(doc.segments)[0], 0.5, {
    pointId: "p",
    newEdgeId: "s",
  });
  const result = applyPointPlacement(doc, target, 25);
  expect(distance(target.start, result.points.p)).toBeCloseTo(25, 10);
  expect(distance(result.points.p, target.end)).toBeCloseTo(75, 10);
});
it("rejects corners and vertices with only one neighbour", () => {
  const doc = addPath(
    emptyDocument("test"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ],
    false,
    id,
  );
  const edge = Object.values(doc.segments)[0];
  expect(() => placementAtVertex(doc, edge.to)).toThrow("corner");
  expect(() => placementAtVertex(doc, edge.from)).toThrow("between two");
});
it("cancel discards preview, apply is one undoable operation", () => {
  const doc = line();
  useEditor.getState().load(doc);
  const target = placementOnEdge(doc, Object.keys(doc.segments)[0], 0.5, {
    pointId: "p",
    newEdgeId: "s",
  });
  const preview = applyPointPlacement(doc, target, 30);
  useEditor.setState({ preview });
  useEditor.getState().cancel();
  expect(useEditor.getState().document).toEqual(doc);
  expect(useEditor.getState().past).toHaveLength(0);
  useEditor.getState().commit(preview);
  expect(useEditor.getState().past).toHaveLength(1);
  useEditor.getState().undo();
  expect(useEditor.getState().document).toEqual(doc);
  useEditor.getState().redo();
  expect(useEditor.getState().document).toEqual(preview);
});
