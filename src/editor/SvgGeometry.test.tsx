import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { emptyDocument } from "../document/schema";
import { addPath } from "../document/operations";
import { SvgGeometry } from "./SvgGeometry";

function fixture() {
  let next = 0;
  return addPath(
    emptyDocument("project"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ],
    false,
    () => `item-${++next}`,
  );
}

describe("visible vertices in every tool", () => {
  it("renders permanent point markers, without stealing drawing clicks", () => {
    const html = renderToStaticMarkup(
      <SvgGeometry
        doc={fixture()}
        selectedIds={[]}
        scale={2}
        interactivePoints={false}
      />,
    );
    expect((html.match(/class="point"/g) ?? []).length).toBe(3);
    expect(html).not.toContain("data-point=");
  });
  it("keeps points draggable only in select/curve editing modes", () => {
    const html = renderToStaticMarkup(
      <SvgGeometry
        doc={fixture()}
        selectedIds={[]}
        scale={2}
        interactivePoints
      />,
    );
    expect((html.match(/data-point=/g) ?? []).length).toBe(3);
  });
});
