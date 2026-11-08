import { expect, it } from "vitest";
import { documentSchema, emptyDocument } from "./schema";
import { edgesInBox, translateEdges } from "./selection";
import { bendCurve } from "./curves";
import { addPath } from "./operations";
import { selectionBounds } from "../geometry/bounds";
function fixture() {
  let i = 0;
  return addPath(
    emptyDocument("test"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ],
    false,
    () => String(++i),
  );
}
it("moves controls with their own anchors, preserving selected curves and shared connections", () => {
  let doc = fixture();
  const [a, b] = Object.keys(doc.segments);
  doc = bendCurve(bendCurve(doc, a, 0.5, { x: 0, y: 30 }), b, 0.5, {
    x: 20,
    y: 0,
  });
  const next = translateEdges(doc, [a, a], { x: 10, y: 20 });
  const first = doc.segments[a],
    second = doc.segments[b];
  const movedFirst = next.segments[a],
    movedSecond = next.segments[b];
  if (
    first.kind !== "cubic" ||
    second.kind !== "cubic" ||
    movedFirst.kind !== "cubic" ||
    movedSecond.kind !== "cubic"
  )
    throw new Error("Expected curves");
  expect(movedFirst.control1).toEqual({
    x: first.control1.x + 10,
    y: first.control1.y + 20,
  });
  expect(movedFirst.control2).toEqual({
    x: first.control2.x + 10,
    y: first.control2.y + 20,
  });
  expect(movedSecond.control1).toEqual({
    x: second.control1.x + 10,
    y: second.control1.y + 20,
  });
  expect(movedSecond.control2).toEqual(second.control2);
  expect(next.points[second.to]).toEqual(doc.points[second.to]);
  expect(doc.points[first.from]).toEqual({ x: 0, y: 0 });
  expect(documentSchema.safeParse(next).success).toBe(true);
});
it("box selection includes curves that cross the area with both endpoints outside", () => {
  let doc = fixture();
  const edge = Object.keys(doc.segments)[0];
  doc = bendCurve(doc, edge, 0.5, { x: 0, y: 30 });
  expect(
    edgesInBox(doc, selectionBounds({ x: 40, y: 20 }, { x: 60, y: 31 })),
  ).toEqual([edge]);
  expect(
    edgesInBox(doc, selectionBounds({ x: 40, y: 0 }, { x: 60, y: 10 })),
  ).toEqual([]);
});
it("selects edges on the boundary and partially enclosed lines", () => {
  const doc = fixture();
  const ids = Object.keys(doc.segments);
  expect(
    edgesInBox(doc, selectionBounds({ x: 0, y: 0 }, { x: 100, y: 100 })),
  ).toEqual(ids);
  expect(
    edgesInBox(doc, selectionBounds({ x: 10, y: -1 }, { x: 90, y: 1 })),
  ).toEqual([ids[0]]);
});
it.each([NaN, Infinity])(
  "rejects invalid movement %s without mutating input",
  (x) => {
    const doc = fixture(),
      before = structuredClone(doc);
    expect(() =>
      translateEdges(doc, Object.keys(doc.segments), { x, y: 0 }),
    ).toThrow("finite");
    expect(doc).toEqual(before);
  },
);
it("moves disconnected selected edges together and leaves unrelated geometry untouched", () => {
  let doc = fixture(),
    i = 100;
  const id = () => String(++i);
  doc = addPath(
    doc,
    [
      { x: 200, y: 0 },
      { x: 300, y: 0 },
    ],
    false,
    id,
  );
  doc = addPath(
    doc,
    [
      { x: 400, y: 0 },
      { x: 500, y: 0 },
    ],
    false,
    id,
  );
  const edges = Object.values(doc.segments);
  const selected = [edges[0], edges[2]];
  const moved = translateEdges(
    doc,
    selected.map((e) => e.id),
    { x: 15.5, y: -20.25 },
  );
  for (const edge of selected) {
    for (const key of [edge.from, edge.to]) {
      expect(moved.points[key]).toEqual({
        x: doc.points[key].x + 15.5,
        y: doc.points[key].y - 20.25,
      });
    }
  }
  for (const key of [edges[3].from, edges[3].to])
    expect(moved.points[key]).toEqual(doc.points[key]);
});
