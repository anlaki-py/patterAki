import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { emptyDocument } from "../document/schema";
import { addPath, splitLine } from "../document/operations";
import { bendCurve } from "../document/curves";
import { CurveHandles } from "./CurveHandles";
it("renders two independently targeted arms at a shared curve point", () => {
  let i = 0;
  const id = () => String(++i);
  const doc = addPath(
      emptyDocument("test"),
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      false,
      id,
    ),
    edge = Object.values(doc.segments)[0];
  const split = splitLine(
    bendCurve(doc, edge.id, 0.5, { x: 0, y: 30 }),
    edge.id,
    0.5,
    id,
  );
  const shared = split.segments[edge.id].to;
  const html = renderToStaticMarkup(
    createElement(
      "svg",
      {},
      createElement(CurveHandles, { doc: split, pointIds: [shared], scale: 2 }),
    ),
  );
  expect(html.match(/data-handle=/g)).toHaveLength(2);
  expect(html).toContain('data-handle="control1"');
  expect(html).toContain('data-handle="control2"');
  expect(html.match(/data-handle-edge=/g)).toHaveLength(2);
});
