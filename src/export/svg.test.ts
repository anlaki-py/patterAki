import { describe, expect, it } from "vitest";
import { emptyDocument } from "../document/schema";
import { addPath } from "../document/operations";
import { createPieceFromEdge } from "../document/pieces";
import { addEllipse } from "../document/ellipse";
import { attachInternalPath } from "../document/piecePathsEdit";
import {
  duplicatePieces,
  transformPieces,
  rotationAround,
} from "../document/pieceTransforms";
import { setSeamAllowance, cutPath } from "../document/seamAllowance";
import { updateSewing } from "../document/sewing";
import { segmentPath } from "../document/segments";
import { exportSvg, type SvgExportOptions } from "./svg";

const stitch: SvgExportOptions = {
  cut: false,
  stitch: true,
  marks: false,
  internal: false,
  metadata: false,
  annotations: false,
};
function fixture(
  points = [
    { x: 0, y: 0 },
    { x: 180, y: 0 },
    { x: 180, y: 240 },
    { x: 0, y: 240 },
  ],
) {
  let n = 0;
  const id = () => `svg-${++n}`;
  const path = addPath(emptyDocument("svg-test"), points, true, id);
  return {
    doc: createPieceFromEdge(
      path,
      Object.keys(path.segments)[0],
      "front",
      "Front & lining",
    ),
    id,
  };
}
function dimensions(svg: string) {
  return {
    width: Number(svg.match(/width="([^"]+)mm"/)![1]),
    height: Number(svg.match(/height="([^"]+)mm"/)![1]),
    viewBox: svg
      .match(/viewBox="([^"]+)"/)![1]
      .split(" ")
      .map(Number),
  };
}
describe("canonical vector SVG", () => {
  it("exports a 180 × 240 mm panel at 1:1 with a 10 mm margin regardless of display units", () => {
    const { doc } = fixture();
    expect(dimensions(exportSvg(doc, ["front"], stitch))).toEqual({
      width: 200,
      height: 260,
      viewBox: [-10, -10, 200, 260],
    });
    expect(exportSvg({ ...doc, unitsDisplay: "in" }, ["front"], stitch)).toBe(
      exportSvg(doc, ["front"], stitch),
    );
  });
  it("includes the derived cut extent as geometry without changing the source", () => {
    const { doc } = fixture();
    const next = setSeamAllowance(doc, "front", {
      widthMm: 5,
      join: "miter",
      miterLimit: 4,
    });
    const before = JSON.stringify(next);
    const svg = exportSvg(next, ["front"], { ...stitch, cut: true });
    expect(dimensions(svg)).toEqual({
      width: 210,
      height: 270,
      viewBox: [-15, -15, 210, 270],
    });
    expect(svg).toContain(`d="${cutPath(next, next.pieces.front)}"`);
    expect(svg).toContain('data-layer="stitch"');
    expect(JSON.stringify(next)).toBe(before);
  });
  it("preserves cubic controls and world placement after rotation and reflection exactly once", () => {
    let n = 0;
    let doc = addEllipse(
      emptyDocument("curve-svg"),
      -40,
      -50,
      100,
      60,
      () => `ellipse-${++n}`,
    );
    const pieceId = Object.keys(doc.pieces)[0];
    doc = transformPieces(doc, [pieceId], rotationAround(90, { x: 0, y: 0 }));
    doc = transformPieces(doc, [pieceId], {
      a: -1,
      b: 0,
      c: 0,
      d: 1,
      e: 80,
      f: -20,
    });
    const svg = exportSvg(doc, [pieceId], stitch);
    for (const edge of Object.values(doc.segments))
      expect(svg).toContain(`d="${segmentPath(doc, edge)}"`);
    expect(svg.match(/ C /g)).toHaveLength(4);
    expect(dimensions(svg).width).toBeCloseTo(80);
    expect(dimensions(svg).height).toBeCloseTo(120);
    expect(svg).not.toContain("transform=");
  });
  it("escapes metadata, annotation text and identifiers without creating XML elements", () => {
    const { doc } = fixture();
    doc.pieces.front.metadata.notes = "<script>\" & '</script>\u0001";
    doc.annotations['a"&'] = {
      id: 'a"&',
      kind: "text",
      position: { x: -100, y: -80 },
      rotation: 90,
      fontSizeMm: 4,
      text: '<svg onload="bad"> & \'\nSecond row',
    };
    const svg = exportSvg(doc, ["front"], {
      ...stitch,
      marks: true,
      metadata: true,
      annotations: true,
    });
    expect(svg).toContain("&lt;script&gt;&quot; &amp; &apos;&lt;/script&gt;�");
    expect(svg).toContain("&lt;svg onload=&quot;bad&quot;&gt; &amp; &apos;");
    expect(svg).toContain('data-annotation="a&quot;&amp;"');
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("\u0001");
    expect(dimensions(svg).viewBox[0]).toBeLessThan(-100);
    expect(dimensions(svg).viewBox[1]).toBeLessThan(-80);
  });
  it("exports only requested visible pieces once and includes locked pieces", () => {
    const { doc, id } = fixture();
    const {
      document: next,
      pieceIds: [back],
    } = duplicatePieces(doc, ["front"], id, { x: 400, y: 0 });
    next.pieces.front.locked = true;
    expect(
      exportSvg(next, ["front", "front"], stitch).match(/data-piece=/g),
    ).toHaveLength(1);
    expect(
      exportSvg(next, ["front", back], stitch).match(/data-piece=/g),
    ).toHaveLength(2);
    next.pieces[back].visible = false;
    expect(exportSvg(next, ["front", back], stitch)).not.toContain(
      `data-piece="${back}"`,
    );
  });
  it("independently toggles cut, stitch, marks, metadata and internal layers", () => {
    const { doc } = fixture();
    for (const layer of [
      "cut",
      "stitch",
      "marks",
      "metadata",
      "internal",
    ] as const) {
      const svg = exportSvg(doc, ["front"], {
        ...stitch,
        stitch: false,
        [layer]: true,
      });
      expect(svg).toContain(`data-layer="${layer}"`);
      for (const other of [
        "cut",
        "stitch",
        "marks",
        "metadata",
        "internal",
      ].filter((x) => x !== layer))
        expect(svg).not.toContain(`data-layer="${other}"`);
    }
  });
  it("respects internal export flags independently of canvas visibility and excludes disabled extents", () => {
    const { doc, id } = fixture();
    let next = addPath(
      doc,
      [
        { x: 1000, y: 0 },
        { x: 1100, y: 0 },
      ],
      false,
      id,
    );
    const edges = Object.keys(next.segments).filter((e) => !doc.segments[e]);
    next = attachInternalPath(next, "front", edges, "internal");
    next = updateSewing(next, "front", (s) => ({
      ...s,
      paths: {
        internal: { role: "construction", visible: false, export: true },
      },
    }));
    expect(exportSvg(next, ["front"], { ...stitch, internal: true })).toContain(
      'd="M 1000 0 L 1100 0"',
    );
    expect(dimensions(exportSvg(next, ["front"], stitch)).width).toBe(200);
    next = updateSewing(next, "front", (s) => ({
      ...s,
      paths: { internal: { ...s.paths.internal, export: false } },
    }));
    const svg = exportSvg(next, ["front"], { ...stitch, internal: true });
    expect(svg).not.toContain("M 1000");
    expect(dimensions(svg).width).toBe(200);
  });
  it("exports attached marks while keeping free annotations optional", () => {
    const { doc } = fixture();
    const next = updateSewing(doc, "front", (s) => ({
      ...s,
      marks: [
        {
          id: "grain",
          kind: "grainline",
          position: { x: 50, y: 50 },
          rotation: 30,
          lengthMm: 40,
          label: "Warp & <weft>",
        },
      ],
    }));
    next.annotations.drill = {
      id: "drill",
      kind: "drill",
      position: { x: 20, y: 20 },
      rotation: 0,
      sizeMm: 2,
    };
    const options = { ...stitch, marks: true };
    expect(exportSvg(next, ["front"], options)).toContain(
      "Warp &amp; &lt;weft&gt;",
    );
    expect(exportSvg(next, ["front"], options)).not.toContain(
      "data-annotation",
    );
    expect(
      exportSvg(next, ["front"], { ...options, annotations: true }),
    ).toContain("<circle");
    expect(
      exportSvg(next, ["front"], { ...stitch, annotations: true }),
    ).not.toContain("<circle");
  });
  it("rejects missing/hidden selections, disabled layers and malformed schemas", () => {
    const { doc } = fixture();
    const before = JSON.stringify(doc);
    expect(() => exportSvg(doc, [], stitch)).toThrow(/visible piece/);
    expect(() => exportSvg(doc, ["missing"], stitch)).toThrow(
      /no longer exists/,
    );
    expect(() =>
      exportSvg(doc, ["front"], {
        ...stitch,
        stitch: false,
        annotations: true,
      }),
    ).toThrow(/layer/);
    expect(() =>
      exportSvg(
        { ...doc, schemaVersion: 999 } as unknown as typeof doc,
        ["front"],
        stitch,
      ),
    ).toThrow(/invalid pattern/);
    expect(JSON.stringify(doc)).toBe(before);
    doc.pieces.front.visible = false;
    expect(() => exportSvg(doc, ["front"], stitch)).toThrow(/visible piece/);
  });
  it("reports impossible cut offsets without mutating geometry and still permits stitch export", () => {
    const { doc } = fixture([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 60, y: 100 },
      { x: 60, y: 20 },
      { x: 40, y: 20 },
      { x: 40, y: 100 },
      { x: 0, y: 100 },
    ]);
    doc.pieces.front.seamAllowance = {
      widthMm: 15,
      join: "miter",
      miterLimit: 4,
    };
    const before = JSON.stringify(doc);
    expect(() => exportSvg(doc, ["front"], { ...stitch, cut: true })).toThrow(
      /Cannot export cut outline.*Front & lining/,
    );
    expect(exportSvg(doc, ["front"], stitch)).toContain('data-layer="stitch"');
    expect(JSON.stringify(doc)).toBe(before);
  });
});
