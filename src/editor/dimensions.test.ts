import { expect, it } from "vitest";
import { emptyDocument } from "../document/schema";
import { addPath } from "../document/operations";
import { moveVertex } from "../document/curves";
import { liveDimensions } from "./dimensions";
it("shows changed adjacent lengths and directions without unrelated dimensions", () => {
  let i = 0;
  const base = addPath(
    emptyDocument("test"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ],
    false,
    () => String(++i),
  );
  const edges = Object.values(base.segments);
  const moved = moveVertex(base, edges[0].to, { x: 120, y: 20 });
  const labels = liveDimensions(base, moved, [edges[0].id]);
  expect(labels).toHaveLength(2);
  expect(labels[0].primary).toBe(true);
  expect(labels[1].text).toContain("→");
  expect(liveDimensions(base, base, [])).toEqual([]);
  expect(liveDimensions(base, base, [edges[0].id])[0].text).toContain("10 cm");
});

it("distinguishes arc and chord lengths when a handle moves, then restores the original labels", async () => {
  const { convertToCurve, moveHandle } = await import("../document/curves");
  let i = 0;
  const line = addPath(
    emptyDocument("curve"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    false,
    () => String(++i),
  );
  const edge = Object.keys(line.segments)[0];
  const base = convertToCurve(line, edge);
  const preview = moveHandle(base, edge, "control1", { x: 30, y: 50 });
  const label = liveDimensions(base, preview, [edge])[0].text;
  expect(label).toContain("Arc 10 cm →");
  expect(label).toContain("Chord 10 cm");
  expect(liveDimensions(base, base, [edge])[0].text).not.toContain("→");
});
