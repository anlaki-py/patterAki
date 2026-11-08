import { beforeEach, expect, it } from "vitest";
import { addPath } from "../document/operations";
import { emptyDocument, documentSchema } from "../document/schema";
import { convertToCurve, moveHandle, moveVertex } from "../document/curves";
import { asCubic, segmentPoint } from "../document/segments";
import { addIntersectionPoints } from "../document/intersections";
import { cubicLength, splitCubic } from "../geometry/bezier";
import { resolvePointer } from "./resolvePointer";
import { insertPointAt } from "./pointTool";
import { intersectionSnaps } from "./intersectionSnaps";
import { useEditor } from "./store";
const options = {
  tool: "line" as const,
  scale: 2,
  touch: false,
  panning: false,
  snap: true,
  grid: false,
  bypass: false,
  constrain: false,
};
let index = 0;
const id = () => String(++index);
beforeEach(() => {
  index = 0;
});
const vertical = () =>
  addPath(
    emptyDocument("test"),
    [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
    ],
    false,
    id,
  );
const crossing = () => {
  let doc = addPath(
    emptyDocument("test"),
    [
      { x: 0, y: 50 },
      { x: 100, y: 50 },
    ],
    false,
    id,
  );
  const horizontal = Object.keys(doc.segments)[0];
  doc = addPath(
    doc,
    [
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ],
    false,
    id,
  );
  return { doc, horizontal, vertical: Object.keys(doc.segments)[1] };
};
it("aligns a new parallel line to the remote top and bottom endpoints", () => {
  const doc = vertical();
  const start = resolvePointer(doc, { x: 200, y: 2 }, options);
  expect(start.point).toEqual({ x: 200, y: 0 });
  expect(start.label).toBe("Horizontal");
  expect(start.guides).toContainEqual({
    from: { x: 0, y: 0 },
    to: { x: 200, y: 0 },
  });
  const end = resolvePointer(
    doc,
    { x: 201, y: 98 },
    { ...options, origin: start.point },
  );
  expect(end.point).toEqual({ x: 200, y: 100 });
  expect(end.guides).toHaveLength(2);
  expect(end.guides).toContainEqual({
    from: { x: 0, y: 100 },
    to: { x: 200, y: 100 },
  });
});
it("snaps to an arbitrary edge position and to its midpoint", () => {
  const doc = vertical();
  expect(resolvePointer(doc, { x: 2, y: 33 }, options)).toMatchObject({
    point: { x: 0, y: 33 },
    label: "On edge",
  });
  expect(resolvePointer(doc, { x: 2, y: 48 }, options)).toMatchObject({
    point: { x: 0, y: 50 },
    label: "Midpoint",
    t: 0.5,
  });
});
it("prefers endpoints and midpoints over ordinary edge projections", () => {
  const doc = vertical();
  expect(resolvePointer(doc, { x: 1, y: 2 }, options)).toMatchObject({
    point: { x: 0, y: 0 },
    label: "Endpoint",
  });
  expect(resolvePointer(doc, { x: 0, y: 48 }, options).point).toEqual({
    x: 0,
    y: 50,
  });
});
it("aligns an inserted point on a vertical edge to a remote reference", () => {
  const doc = addPath(
    vertical(),
    [
      { x: 200, y: 25 },
      { x: 220, y: 45 },
    ],
    false,
    id,
  );
  const snap = resolvePointer(
    doc,
    { x: 1, y: 26 },
    { ...options, tool: "point" },
  );
  expect(snap.point).toEqual({ x: 0, y: 25 });
  expect(snap.guides).toContainEqual({
    from: { x: 200, y: 25 },
    to: { x: 0, y: 25 },
  });
  useEditor.getState().load(doc);
  expect(
    insertPointAt(snap.point, 4, { edgeId: snap.edgeId!, t: snap.t! }),
  ).toBe(true);
  expect(Object.values(useEditor.getState().document.points)).toContainEqual({
    x: 0,
    y: 25,
  });
  expect(useEditor.getState().past).toHaveLength(1);
});
it("keeps remote alignment on a diagonal edge exact", () => {
  let doc = addPath(
    emptyDocument("test"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ],
    false,
    id,
  );
  doc = addPath(
    doc,
    [
      { x: 200, y: 30 },
      { x: 200, y: 80 },
    ],
    false,
    id,
  );
  const snap = resolvePointer(
    doc,
    { x: 31, y: 29 },
    { ...options, tool: "point" },
  );
  expect(snap.point.x).toBeCloseTo(30, 10);
  expect(snap.point.y).toBeCloseTo(30, 10);
});
it("uses the actual arc midpoint of a nonuniform cubic", () => {
  let doc = addPath(
    emptyDocument("test"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    false,
    id,
  );
  const edge = Object.keys(doc.segments)[0];
  doc = moveHandle(
    moveHandle(convertToCurve(doc, edge), edge, "control1", { x: 0, y: 0 }),
    edge,
    "control2",
    { x: 0, y: 0 },
  );
  const snap = resolvePointer(doc, { x: 49, y: 1 }, options);
  expect(snap.label).toBe("Midpoint");
  expect(snap.point.x).toBeCloseTo(50, 6);
  expect(
    cubicLength(splitCubic(asCubic(doc, doc.segments[edge]), snap.t!)[0]),
  ).toBeCloseTo(50, 6);
});
it("aligns to a remote horizontal reference while staying on a curve", () => {
  let doc = addPath(
    emptyDocument("test"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    false,
    id,
  );
  const edge = Object.keys(doc.segments)[0];
  doc = moveHandle(
    moveHandle(convertToCurve(doc, edge), edge, "control1", { x: 0, y: 100 }),
    edge,
    "control2",
    { x: 100, y: 100 },
  );
  doc = addPath(
    doc,
    [
      { x: 200, y: 50 },
      { x: 220, y: 20 },
    ],
    false,
    id,
  );
  const snap = resolvePointer(
    doc,
    { x: 12, y: 51 },
    { ...options, tool: "point" },
  );
  expect(snap.point.y).toBeCloseTo(50, 7);
  expect(snap.label).toBe("On edge · Horizontal");
  expect(snap.point).toEqual(segmentPoint(doc, doc.segments[edge], snap.t!));
});
it("Alt and Snap off bypass alignment; point insertion still stays on its edge", () => {
  const doc = addPath(
    vertical(),
    [
      { x: 200, y: 25 },
      { x: 220, y: 45 },
    ],
    false,
    id,
  );
  expect(
    resolvePointer(doc, { x: 200, y: 2 }, { ...options, bypass: true }),
  ).toEqual({ point: { x: 200, y: 2 }, label: "" });
  expect(
    resolvePointer(doc, { x: 200, y: 2 }, { ...options, snap: false }),
  ).toEqual({ point: { x: 200, y: 2 }, label: "" });
  expect(
    resolvePointer(
      doc,
      { x: 1, y: 26 },
      { ...options, tool: "point", bypass: true },
    ),
  ).toMatchObject({ point: { x: 0, y: 26 }, label: "Insert point" });
});
it("uses screen tolerance for guides without a maximum reference distance", () => {
  const doc = vertical();
  expect(resolvePointer(doc, { x: 10000, y: 3 }, options).point.y).toBe(0);
  expect(
    resolvePointer(doc, { x: 10000, y: 3 }, { ...options, scale: 4 }),
  ).toEqual({ point: { x: 10000, y: 3 }, label: "" });
});
it("does not advertise a free-floating point insertion off every edge", () => {
  expect(
    resolvePointer(vertical(), { x: 200, y: 2 }, { ...options, tool: "point" }),
  ).toEqual({ point: { x: 200, y: 2 }, label: "" });
});
it("T06 gives Line and Polyline the same live crossing that a click commits", () => {
  const { doc } = crossing();
  const start = { x: 0, y: 0 };
  for (const tool of ["line", "polyline"] as const) {
    const preview = resolvePointer(
      doc,
      { x: 52, y: 51 },
      { ...options, tool, origin: start },
    );
    expect(preview).toMatchObject({
      point: { x: 50, y: 50 },
      label: "Intersection",
    });
    const committed = addPath(doc, [start, preview.point], false, id);
    const edge = Object.values(committed.segments).at(-1)!;
    expect(committed.points[edge.to]).toEqual({ x: 50, y: 50 });
    expect(committed.points[edge.to]).toEqual(preview.point);
  }
});
it("T07 inserts Add point on only the chosen crossing edge", () => {
  const { doc, horizontal, vertical } = crossing();
  const snap = resolvePointer(
    doc,
    { x: 52, y: 51 },
    { ...options, tool: "point" },
  );
  expect(snap).toMatchObject({
    point: { x: 50, y: 50 },
    label: "Intersection",
    edgeId: horizontal,
    t: 0.5,
  });
  useEditor.getState().load(doc);
  expect(
    insertPointAt(snap.point, 8 / 2, { edgeId: snap.edgeId!, t: snap.t! }),
  ).toBe(true);
  const state = useEditor.getState();
  expect(Object.keys(state.document.segments)).toHaveLength(3);
  expect(state.document.segments[vertical]).toEqual(doc.segments[vertical]);
  expect(Object.keys(state.document.points)).toHaveLength(5);
  expect(Object.values(state.document.points)).toContainEqual({ x: 50, y: 50 });
  expect(state.past).toHaveLength(1);
  state.undo();
  expect(useEditor.getState().document).toEqual(doc);
});
it("T08 keeps unrelated crossings while dragging and excludes incident edges", () => {
  const { doc, horizontal } = crossing();
  const withUnrelated = addPath(
    doc,
    [
      { x: 200, y: 200 },
      { x: 220, y: 220 },
    ],
    false,
    id,
  );
  const extra = Object.values(withUnrelated.segments).at(-1)!;
  expect(
    resolvePointer(
      withUnrelated,
      { x: 52, y: 51 },
      {
        ...options,
        movingPoint: extra.from,
      },
    ),
  ).toMatchObject({ point: { x: 50, y: 50 }, label: "Intersection" });
  expect(
    intersectionSnaps(doc, { x: 52, y: 51 }, 4, doc.segments[horizontal].from),
  ).toEqual([]);
  expect(
    resolvePointer(
      doc,
      { x: 52, y: 51 },
      {
        ...options,
        movingPoint: doc.segments[horizontal].from,
      },
    ).label,
  ).not.toBe("Intersection");
});
it("T13 keeps a shared crossing endpoint labelled Endpoint and non-insertable", () => {
  let doc = addPath(
    emptyDocument("test"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    false,
    id,
  );
  doc = addPath(
    doc,
    [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
    ],
    false,
    id,
  );
  expect(resolvePointer(doc, { x: 1, y: 1 }, options)).toEqual({
    point: { x: 0, y: 0 },
    label: "Endpoint",
  });
  const candidate = intersectionSnaps(doc, { x: 1, y: 1 }, 4)[0];
  expect(candidate.point).toEqual({ x: 0, y: 0 });
  useEditor.getState().load(doc);
  expect(
    insertPointAt(candidate.point, 4, {
      edgeId: candidate.edgeId!,
      t: candidate.t!,
    }),
  ).toBe(false);
  expect(useEditor.getState().past).toHaveLength(0);
});
it("T16 keeps intersection previews transient during repeated hover", () => {
  const { doc } = crossing();
  const snapshot = structuredClone(doc);
  useEditor.getState().load(doc);
  const before = useEditor.getState();
  expect(resolvePointer(doc, { x: 52, y: 51 }, options).label).toBe(
    "Intersection",
  );
  expect(resolvePointer(doc, { x: 51, y: 51 }, options).label).toBe(
    "Intersection",
  );
  const after = useEditor.getState();
  expect(doc).toEqual(snapshot);
  expect(after.document).toBe(before.document);
  expect(after.revision).toBe(before.revision);
  expect(after.past).toBe(before.past);
  expect(after.future).toBe(before.future);
  expect(after.preview).toBe(before.preview);
  expect(after.saveStatus).toBe(before.saveStatus);
});
it("T17 drops stale crossings after edits and follows undo/redo", () => {
  const { doc, horizontal } = crossing();
  const edge = doc.segments[horizontal];
  let moved = moveVertex(doc, edge.from, {
    x: doc.points[edge.from].x,
    y: 60,
  });
  moved = moveVertex(moved, edge.to, { x: doc.points[edge.to].x, y: 60 });
  expect(resolvePointer(doc, { x: 51, y: 51 }, options)).toMatchObject({
    point: { x: 50, y: 50 },
    label: "Intersection",
  });
  expect(resolvePointer(moved, { x: 51, y: 51 }, options).label).not.toBe(
    "Intersection",
  );
  expect(resolvePointer(moved, { x: 51, y: 61 }, options)).toMatchObject({
    point: { x: 50, y: 60 },
    label: "Intersection",
  });
  useEditor.getState().load(doc);
  useEditor.getState().commit(moved);
  expect(
    resolvePointer(useEditor.getState().document, { x: 51, y: 61 }, options)
      .point,
  ).toEqual({ x: 50, y: 60 });
  useEditor.getState().undo();
  expect(
    resolvePointer(useEditor.getState().document, { x: 51, y: 51 }, options)
      .point,
  ).toEqual({ x: 50, y: 50 });
  useEditor.getState().redo();
  expect(
    resolvePointer(useEditor.getState().document, { x: 51, y: 61 }, options)
      .point,
  ).toEqual({ x: 50, y: 60 });
});
it("T18 keeps the explicit intersection command splitting both participants", () => {
  const { doc, horizontal } = crossing();
  const result = addIntersectionPoints(doc, horizontal, id);
  expect(result.splitCount).toBe(2);
  expect(Object.keys(result.document.segments)).toHaveLength(4);
  expect(documentSchema.safeParse(result.document).success).toBe(true);
});
