import { beforeEach, expect, it } from "vitest";
import { addPath } from "./operations";
import { emptyDocument, documentSchema } from "./schema";
import { addIntersectionPoints } from "./intersections";
import { bendCurve } from "./curves";
import { segmentLength } from "./segments";
import { useEditor } from "../editor/store";
import { executeEdgeActions } from "../editor/edgeActions";
import { deleteSelection } from "../editor/selectionActions";
let i = 0;
const id = () => String(++i);
const base = () =>
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
  i = 0;
});
it("splits both crossing lines with a single shared vertex", () => {
  const first = base(),
    edge = Object.keys(first.segments)[0];
  const doc = addPath(
    first,
    [
      { x: 25, y: -20 },
      { x: 25, y: 20 },
    ],
    false,
    id,
  );
  const result = addIntersectionPoints(doc, edge, id);
  expect(result.splitCount).toBe(2);
  expect(Object.keys(result.document.segments)).toHaveLength(4);
  const point = Object.entries(result.document.points).find(
    ([, p]) => p.x === 25 && p.y === 0,
  )!;
  expect(
    Object.values(result.document.segments).filter(
      (e) => e.from === point[0] || e.to === point[0],
    ),
  ).toHaveLength(4);
  expect(documentSchema.safeParse(result.document).success).toBe(true);
  expect(Object.keys(doc.segments)).toHaveLength(2);
});
it("handles multiple crossings in one selected edge in parameter order", () => {
  let doc = base();
  const edge = Object.keys(doc.segments)[0];
  for (const x of [75, 25, 50])
    doc = addPath(
      doc,
      [
        { x, y: -10 },
        { x, y: 10 },
      ],
      false,
      id,
    );
  const next = addIntersectionPoints(doc, edge, id).document;
  expect(Object.keys(next.segments)).toHaveLength(10);
  expect(documentSchema.safeParse(next).success).toBe(true);
  const horizontal = Object.values(next.segments).filter(
    (e) => next.points[e.from].y === 0 && next.points[e.to].y === 0,
  );
  expect(horizontal.map((e) => segmentLength(next, e))).toEqual([
    25, 25, 25, 25,
  ]);
});
it("reuses endpoint touches and is idempotent on repeated invocation", () => {
  const first = base(),
    edge = Object.keys(first.segments)[0],
    doc = addPath(
      first,
      [
        { x: 50, y: 0 },
        { x: 50, y: 20 },
      ],
      false,
      id,
    );
  const next = addIntersectionPoints(doc, edge, id).document;
  expect(Object.keys(next.points)).toHaveLength(4);
  expect(Object.keys(next.segments)).toHaveLength(3);
  expect(addIntersectionPoints(next, edge, id).document).toEqual(next);
});
it("creates one shared node when several edges cross at the same place", () => {
  const first = base(),
    edge = Object.keys(first.segments)[0];
  let doc = addPath(
    first,
    [
      { x: 50, y: -20 },
      { x: 50, y: 20 },
    ],
    false,
    id,
  );
  doc = addPath(
    doc,
    [
      { x: 30, y: -20 },
      { x: 70, y: 20 },
    ],
    false,
    id,
  );
  const next = addIntersectionPoints(doc, edge, id).document;
  expect(
    Object.values(next.points).filter((p) => p.x === 50 && p.y === 0),
  ).toHaveLength(1);
  expect(Object.keys(next.segments)).toHaveLength(6);
});
it("preserves cubic arc length while adding intersection vertices", () => {
  let doc = base();
  const edge = Object.keys(doc.segments)[0];
  doc = bendCurve(doc, edge, 0.5, { x: 0, y: 40 });
  const length = segmentLength(doc, doc.segments[edge]);
  doc = addPath(
    doc,
    [
      { x: 50, y: -20 },
      { x: 50, y: 60 },
    ],
    false,
    id,
  );
  const next = addIntersectionPoints(doc, edge, id).document;
  const curves = Object.values(next.segments).filter((e) => e.kind === "cubic");
  expect(curves).toHaveLength(2);
  expect(
    curves.reduce((sum, e) => sum + segmentLength(next, e), 0),
  ).toBeCloseTo(length, 3);
  expect(documentSchema.safeParse(next).success).toBe(true);
});
it("commits all crossings in one undo step and leaves failed overlap edits untouched", () => {
  const first = base(),
    edge = Object.keys(first.segments)[0],
    doc = addPath(
      first,
      [
        { x: 50, y: -20 },
        { x: 50, y: 20 },
      ],
      false,
      id,
    );
  useEditor.getState().load(doc);
  executeEdgeActions([edge], "intersections");
  expect(useEditor.getState().past).toHaveLength(1);
  useEditor.getState().undo();
  expect(useEditor.getState().document).toEqual(doc);
  const overlap = addPath(
    doc,
    [
      { x: 25, y: 0 },
      { x: 75, y: 0 },
    ],
    false,
    id,
  );
  useEditor.getState().load(overlap);
  expect(() => executeEdgeActions([edge], "intersections")).toThrow(
    "Overlapping",
  );
  expect(useEditor.getState().document).toEqual(overlap);
  expect(useEditor.getState().past).toHaveLength(0);
});
it("deletes and resets the requested edge, not a previously selected one", () => {
  const first = base(),
    edge = Object.keys(first.segments)[0];
  const doc = addPath(
    bendCurve(first, edge, 0.5, { x: 0, y: 20 }),
    [
      { x: 0, y: 100 },
      { x: 100, y: 100 },
    ],
    false,
    id,
  );
  const other = Object.keys(doc.segments)[1];
  useEditor.getState().load(doc);
  useEditor.setState({ selected: [other] });
  executeEdgeActions([edge], "reset");
  expect(useEditor.getState().document.segments[edge].kind).toBe("line");
  expect(useEditor.getState().document.segments[other]).toEqual(
    doc.segments[other],
  );
  deleteSelection([edge]);
  expect(useEditor.getState().document.segments[edge]).toBeUndefined();
  expect(useEditor.getState().document.segments[other]).toEqual(
    doc.segments[other],
  );
});
it("does not add new points when rerun on a curve crossing", () => {
  let doc = base();
  const edge = Object.keys(doc.segments)[0];
  doc = bendCurve(doc, edge, 0.5, { x: 0, y: 40 });
  doc = addPath(
    doc,
    [
      { x: 50, y: -20 },
      { x: 50, y: 60 },
    ],
    false,
    id,
  );
  const next = addIntersectionPoints(doc, edge, id).document;
  expect(addIntersectionPoints(next, edge, id).document).toEqual(next);
});
