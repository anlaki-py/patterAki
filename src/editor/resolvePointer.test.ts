import { beforeEach, expect, it } from "vitest";
import { addPath } from "../document/operations";
import { emptyDocument } from "../document/schema";
import { resolvePointer } from "./resolvePointer";
const options = {
  tool: "line" as const,
  scale: 2,
  touch: false,
  panning: false,
  snap: true,
  grid: true,
  bypass: false,
  constrain: false,
};
let index = 0;
const id = () => String(++index);
beforeEach(() => {
  index = 0;
});
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
  return { doc, horizontal };
};
it("keeps grid snapping without a ring or label", () => {
  expect(
    resolvePointer(emptyDocument("test"), { x: 11, y: 9 }, options),
  ).toEqual({ point: { x: 10, y: 10 }, label: "" });
});
it.each(["select", "pan"] as const)(
  "does not snap or label idle %s movement",
  (tool) => {
    expect(
      resolvePointer(
        emptyDocument("test"),
        { x: 11, y: 9 },
        { ...options, tool },
      ),
    ).toEqual({ point: { x: 11, y: 9 }, label: "" });
  },
);
it("preserves endpoint feedback during drawing", () => {
  const doc = { ...emptyDocument("test"), points: { p: { x: 12, y: 10 } } };
  expect(resolvePointer(doc, { x: 11, y: 9 }, options)).toEqual({
    point: { x: 12, y: 10 },
    label: "Endpoint",
  });
});
it("suppresses snap feedback during temporary pan", () => {
  expect(
    resolvePointer(
      emptyDocument("test"),
      { x: 11, y: 9 },
      { ...options, panning: true },
    ),
  ).toEqual({ point: { x: 11, y: 9 }, label: "" });
});
it("T01 prefers a live intersection over coincident edge midpoints", () => {
  const { doc, horizontal } = crossing();
  expect(resolvePointer(doc, { x: 52, y: 51 }, options)).toEqual({
    point: { x: 50, y: 50 },
    label: "Intersection",
    edgeId: horizontal,
    t: 0.5,
  });
});
it("T02 rejects an intersection outside the mouse tolerance and falls back to the edge", () => {
  const { doc } = crossing();
  const snap = resolvePointer(doc, { x: 55, y: 50 }, options);
  expect(snap.label).toBe("On edge");
  expect(snap.point.x).toBeCloseTo(55, 10);
  expect(snap.point.y).toBe(50);
});
it("T03 bypasses intersection snapping with Alt or Snap off", () => {
  const { doc } = crossing();
  expect(
    resolvePointer(doc, { x: 52, y: 51 }, { ...options, bypass: true }),
  ).toEqual({ point: { x: 52, y: 51 }, label: "" });
  expect(
    resolvePointer(doc, { x: 52, y: 51 }, { ...options, snap: false }),
  ).toEqual({ point: { x: 52, y: 51 }, label: "" });
});
it("T04 converts the mouse radius from pixels at every zoom", () => {
  const { doc } = crossing();
  const zoomed = { ...options, scale: 4 };
  expect(resolvePointer(doc, { x: 51.5, y: 50 }, zoomed)).toMatchObject({
    point: { x: 50, y: 50 },
    label: "Intersection",
  });
  const outside = resolvePointer(doc, { x: 52.25, y: 50 }, zoomed);
  expect(outside.label).not.toBe("Intersection");
  expect(outside.point).toEqual({ x: 52.25, y: 50 });
});
it("T05 uses the larger touch pickup radius", () => {
  const { doc } = crossing();
  const touch = { ...options, touch: true };
  expect(resolvePointer(doc, { x: 56, y: 50 }, touch)).toMatchObject({
    point: { x: 50, y: 50 },
    label: "Intersection",
  });
  const outside = resolvePointer(doc, { x: 58.5, y: 50 }, touch);
  expect(outside.label).not.toBe("Intersection");
});
it("keeps grid snapping below intersection candidates", () => {
  let doc = addPath(
    emptyDocument("test"),
    [
      { x: 0, y: 52 },
      { x: 100, y: 52 },
    ],
    false,
    id,
  );
  doc = addPath(
    doc,
    [
      { x: 52, y: 0 },
      { x: 52, y: 100 },
    ],
    false,
    id,
  );
  expect(resolvePointer(doc, { x: 52.2, y: 52.2 }, options)).toMatchObject({
    point: { x: 52, y: 52 },
    label: "Intersection",
  });
});
