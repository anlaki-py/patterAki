import { expect, it } from "vitest";
import { annotationBounds } from "../document/annotationGeometry";
import { newAnnotation, putAnnotation } from "../document/annotations";
import { emptyDocument } from "../document/schema";
import { fitView } from "./fitView";
it("fits an annotation-only document including rotated label extents", () => {
  const doc = putAnnotation(
    emptyDocument("marks"),
    newAnnotation("grainline", { x: -500, y: 900 }, "grain"),
  );
  const bounds = annotationBounds(doc.annotations.grain);
  const view = fitView(doc, 800, 600);
  for (const p of [bounds.min, bounds.max]) {
    expect(view.x + p.x * view.scale).toBeGreaterThanOrEqual(39.999);
    expect(view.x + p.x * view.scale).toBeLessThanOrEqual(760.001);
    expect(view.y + p.y * view.scale).toBeGreaterThanOrEqual(39.999);
    expect(view.y + p.y * view.scale).toBeLessThanOrEqual(560.001);
  }
});
it("keeps the initial view for an empty document", () => {
  expect(fitView(emptyDocument("empty"), 800, 600)).toEqual({
    x: 40,
    y: 40,
    scale: 2,
  });
});
