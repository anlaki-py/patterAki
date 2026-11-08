import { expect, it } from "vitest";
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
