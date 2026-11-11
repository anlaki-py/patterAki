import { expect, it } from "vitest";
import { divideEdge, divisionDistances } from "./divisions";
import { addPath } from "./operations";
import { emptyDocument } from "./schema";
import { asCubic, segmentLength, segmentPoint } from "./segments";
import { bendCurve } from "./curves";
import { cubicPoint, projectCubic } from "../geometry/bezier";
import { distance } from "../geometry/line";
import { useEditor } from "../editor/store";
let counter = 0;
const id = () => `division-${++counter}`;
function line() {
  return addPath(
    emptyDocument("division"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    false,
    id,
  );
}
it("places percentage and repeated divisions from all origins", () => {
  expect(divisionDistances(100, "percent", 25, "start")).toEqual([25]);
  expect(divisionDistances(100, "percent", 25, "end")).toEqual([75]);
  expect(divisionDistances(100, "percent", -25, "center")).toEqual([25]);
  expect(divisionDistances(100, "percent", 0, "center")).toEqual([50]);
  expect(divisionDistances(100, "spacing", 30, "start")).toEqual([30, 60, 90]);
  expect(divisionDistances(100, "spacing", 30, "end")).toEqual([10, 40, 70]);
  expect(divisionDistances(100, "spacing", 30, "center")).toEqual([20, 50, 80]);
  expect(divisionDistances(100, "spacing", 25, "start")).toEqual([25, 50, 75]);
  expect(divisionDistances(100, "equal", 4, "center")).toEqual([25, 50, 75]);
});
it("rejects endpoints, nonfinite values, fractional counts and dense divisions", () => {
  for (const value of [0, 100, -1, NaN, Infinity])
    expect(() => divisionDistances(100, "percent", value, "start")).toThrow();
  for (const value of [0, -10, 0.0001, 100, Infinity])
    expect(() => divisionDistances(100, "spacing", value, "start")).toThrow();
  for (const value of [1, 2.5, 1001])
    expect(() => divisionDistances(100, "equal", value, "start")).toThrow();
  expect(() => divisionDistances(1, "equal", 1000, "start")).not.toThrow();
  expect(() => divisionDistances(0.1, "equal", 1000, "start")).toThrow();
});
it("commits many splits as one undo step and preserves geometry on rejected splits", () => {
  const base = line(),
    edgeId = Object.keys(base.segments)[0];
  useEditor.getState().load(base);
  const next = divideEdge(base, edgeId, [25, 50, 75], id);
  expect(Object.keys(base.segments)).toHaveLength(1);
  expect(
    Object.values(next.segments).map((e) => segmentLength(next, e)),
  ).toEqual([25, 25, 25, 25]);
  useEditor.getState().commit(next);
  expect(useEditor.getState().past).toHaveLength(1);
  useEditor.getState().undo();
  expect(useEditor.getState().document).toEqual(base);
  useEditor.getState().redo();
  expect(useEditor.getState().document).toEqual(next);
  for (const values of [[0], [100], [50, 50], [NaN], [-1], [101]])
    expect(() => divideEdge(base, edgeId, values, id)).toThrow();
  expect(Object.keys(base.points)).toHaveLength(2);
});
it("divides a cubic by arc distance while retaining its original shape", () => {
  const straight = line(),
    edgeId = Object.keys(straight.segments)[0];
  const base = bendCurve(straight, edgeId, 0.5, { x: 0, y: 40 });
  const original = asCubic(base, base.segments[edgeId]);
  const total = segmentLength(base, base.segments[edgeId]);
  const next = divideEdge(
    base,
    edgeId,
    divisionDistances(total, "equal", 4, "start"),
    id,
  );
  for (const edge of Object.values(next.segments)) {
    expect(segmentLength(next, edge)).toBeCloseTo(total / 4, 2);
    for (let t = 0; t <= 1; t += 0.1) {
      const p = segmentPoint(next, edge, t);
      expect(
        distance(p, cubicPoint(original, projectCubic(original, p))),
      ).toBeLessThan(0.001);
    }
  }
});
