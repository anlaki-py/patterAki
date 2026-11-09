import { beforeEach, expect, it } from "vitest";
import { addGuide } from "../document/guides";
import { addPath } from "../document/operations";
import { emptyDocument } from "../document/schema";
import {
  resolveSnapDetailed,
  type SnapResolutionOptions,
} from "./snapResolver";

let nextId = 0;
beforeEach(() => {
  nextId = 0;
});

const opts: SnapResolutionOptions = {
  tool: "line",
  scale: 2,
  touch: false,
  panning: false,
  snap: true,
  grid: true,
  bypass: false,
  constrain: false,
  // Omit modes so the resolver uses the real all-enabled defaults.
};

const line = (length: number) =>
  addPath(
    emptyDocument(`snapping-${length}`),
    [
      { x: 0, y: 50 },
      { x: length, y: 50 },
    ],
    false,
    () => String(++nextId),
  );

it("snaps to a 12 mm line midpoint even when both endpoints are in pickup range", () => {
  const doc = line(12);
  const result = resolveSnapDetailed(
    doc,
    { x: 6, y: 50 },
    { ...opts, scale: 1 },
  );
  expect(result.chosen).toMatchObject({
    kind: "midpoint",
    label: "Midpoint",
    point: { x: 6, y: 50 },
  });
});

it("a held short-line endpoint yields when the pointer reaches its midpoint", () => {
  const doc = line(12);
  const endpoint = resolveSnapDetailed(
    doc,
    { x: 0, y: 50 },
    { ...opts, scale: 1 },
  );
  expect(endpoint.chosen?.kind).toBe("endpoint");
  const middle = resolveSnapDetailed(
    doc,
    { x: 6, y: 50 },
    {
      ...opts,
      scale: 1,
      previousLock: endpoint.lock,
    },
  );
  expect(middle.chosen).toMatchObject({
    kind: "midpoint",
    point: { x: 6, y: 50 },
  });
});

it("a held On edge snap yields to midpoint anywhere within pickup radius", () => {
  const doc = line(100);
  const first = resolveSnapDetailed(doc, { x: 20, y: 52 }, opts);
  expect(first.chosen?.kind).toBe("on-edge");
  // Midpoint is 3 mm / 6 CSS px away; the existing 8 px pickup must apply.
  const approaching = resolveSnapDetailed(
    doc,
    { x: 47, y: 50 },
    {
      ...opts,
      previousLock: first.lock,
    },
  );
  expect(approaching.chosen).toMatchObject({
    kind: "midpoint",
    point: { x: 50, y: 50 },
  });
  expect(approaching.lock?.kind).toBe("midpoint");
});

it("does not incorrectly jump to a midpoint outside the pickup radius", () => {
  const doc = line(100);
  const first = resolveSnapDetailed(doc, { x: 20, y: 52 }, opts);
  const alongEdge = resolveSnapDetailed(
    doc,
    { x: 40, y: 50 },
    {
      ...opts,
      previousLock: first.lock,
    },
  );
  expect(alongEdge.chosen).toMatchObject({
    kind: "on-edge",
    point: { x: 40, y: 50 },
  });
});

it("a guide-edge intersection can replace a held On edge snap", () => {
  const doc = addGuide(line(100), "x", 30, "guide-30");
  const first = resolveSnapDetailed(doc, { x: 20, y: 52 }, opts);
  expect(first.chosen?.kind).toBe("on-edge");
  const crossing = resolveSnapDetailed(
    doc,
    { x: 27, y: 50 },
    {
      ...opts,
      previousLock: first.lock,
    },
  );
  expect(crossing.chosen).toMatchObject({
    kind: "guide-intersection",
    point: { x: 30, y: 50 },
  });
});

it("a live line intersection can replace a held On edge snap", () => {
  let doc = line(100);
  doc = addPath(
    doc,
    [
      { x: 30, y: 20 },
      { x: 30, y: 80 },
    ],
    false,
    () => String(++nextId),
  );
  const first = resolveSnapDetailed(doc, { x: 20, y: 52 }, opts);
  expect(first.chosen?.kind).toBe("on-edge");
  const crossing = resolveSnapDetailed(
    doc,
    { x: 29, y: 50 },
    {
      ...opts,
      previousLock: first.lock,
    },
  );
  expect(crossing.chosen).toMatchObject({
    kind: "intersection",
    point: { x: 30, y: 50 },
  });
});

it("a perpendicular foot can replace a held On edge snap", () => {
  const doc = line(100);
  const withOrigin = { ...opts, origin: { x: 30, y: 0 } };
  const first = resolveSnapDetailed(doc, { x: 20, y: 52 }, withOrigin);
  expect(first.chosen?.kind).toBe("on-edge");
  const foot = resolveSnapDetailed(
    doc,
    { x: 27, y: 50 },
    {
      ...withOrigin,
      previousLock: first.lock,
    },
  );
  expect(foot.chosen).toMatchObject({
    kind: "perpendicular",
    point: { x: 30, y: 50 },
  });
});

it("the midpoint mode switch still disables midpoint snapping", () => {
  const doc = line(100);
  const result = resolveSnapDetailed(
    doc,
    { x: 50, y: 50 },
    {
      ...opts,
      modes: {
        endpoints: true,
        intersections: true,
        midpoints: false,
        edges: true,
        alignments: true,
        perpendicular: true,
        guides: true,
        grid: true,
      },
    },
  );
  expect(result.chosen?.kind).not.toBe("midpoint");
});

it("touch pickup also reaches the midpoint of a short line", () => {
  const doc = line(12);
  const result = resolveSnapDetailed(
    doc,
    { x: 6, y: 50 },
    {
      ...opts,
      touch: true,
    },
  );
  expect(result.chosen).toMatchObject({
    kind: "midpoint",
    point: { x: 6, y: 50 },
  });
});
