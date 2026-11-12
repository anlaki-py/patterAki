import { describe, expect, it } from "vitest";
import {
  PDFDocument,
  PDFArray,
  PDFRawStream,
  PDFName,
  PDFDict,
  decodePDFRawStream,
} from "pdf-lib";
import { emptyDocument } from "../document/schema";
import { addPath } from "../document/operations";
import { createPieceFromEdge } from "../document/pieces";
import { setSeamAllowance } from "../document/seamAllowance";
import { addEllipse } from "../document/ellipse";
import { transformPieces, rotationAround } from "../document/pieceTransforms";
import { updateSewing } from "../document/sewing";
import { attachInternalPath } from "../document/piecePathsEdit";
import { exportPdf, type PdfExportOptions } from "./pdf";
import { defaultPdfLayout, PDF_POINTS_PER_MM as pt } from "./tiling";
import { defaultPdfLayers, pdfDrawing } from "./pdfDrawing";

const options: PdfExportOptions = {
  ...defaultPdfLayout,
  layers: { ...defaultPdfLayers, metadata: false },
  annotations: false,
};
function fixture(width = 180, height = 240) {
  let n = 0;
  const id = () => `pdf-${++n}`;
  let doc = addPath(
    emptyDocument("pdf-test"),
    [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
    true,
    id,
  );
  doc = createPieceFromEdge(
    doc,
    Object.keys(doc.segments)[0],
    "front",
    "Wallet",
  );
  return { doc, id };
}
async function inspect(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  const streams = pdf.getPages().map((page) => {
    const contents = page.node.Contents()!;
    if (contents instanceof PDFRawStream)
      return new TextDecoder().decode(decodePDFRawStream(contents).decode());
    if (!(contents instanceof PDFArray))
      throw new Error("Expected an array of PDF content streams.");
    return Array.from({ length: contents.size() }, (_, i) =>
      new TextDecoder().decode(
        decodePDFRawStream(contents.lookup(i, PDFRawStream)).decode(),
      ),
    ).join("\n");
  });
  return { pdf, streams };
}
const matrices = (text: string) =>
  [
    ...text.matchAll(
      /([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([-\d.e]+) cm/g,
    ),
  ].map((m) => m.slice(1).map(Number));

describe("actual-size vector PDFs", () => {
  it("passes the M3 gate: 190 x 250 mm cut, 1:1 A4 tiles and exact 100 mm calibration", async () => {
    const { doc } = fixture();
    const next = setSeamAllowance(doc, "front", {
      widthMm: 5,
      join: "miter",
      miterLimit: 4,
    });
    const before = JSON.stringify(next);
    const drawing = pdfDrawing(next, ["front"], options.layers, false);
    expect(drawing.bounds).toEqual({
      min: { x: -5, y: -5 },
      max: { x: 185, y: 245 },
    });
    const { pdf, streams } = await inspect(
      await exportPdf(next, ["front"], options),
    );
    expect(pdf.getPageCount()).toBe(3);
    for (const page of pdf.getPages()) {
      expect(page.getWidth()).toBeCloseTo(210 * pt, 10);
      expect(page.getHeight()).toBeCloseTo(297 * pt, 10);
      expect(
        page.node.Resources()?.lookup(PDFName.of("XObject"), PDFDict).keys(),
      ).toHaveLength(0);
    }
    expect(streams[0]).toContain(`${100 * pt} 0 l`);
    expect(streams[0]).toContain(`${100 * pt} ${100 * pt} l`);
    const prefs = pdf.catalog.lookup(PDFName.of("ViewerPreferences"), PDFDict);
    expect(prefs.get(PDFName.of("PrintScaling"))?.toString()).toBe("/None");
    for (const stream of streams.slice(1)) {
      expect(stream).toContain("-5 -5 m\n185 -5 l\n185 245 l\n-5 245 l");
      expect(stream).toContain("180 0 l");
      expect(stream).toContain("W\nn");
      expect(matrices(stream).some((m) => m[0] === pt && m[3] === -pt)).toBe(
        true,
      );
    }
    const translations = streams
      .slice(1)
      .map((s) =>
        matrices(s).find(
          (m) => m[0] === 1 && m[3] === 1 && m[4] !== 0 && m[5] !== 0,
        )!,
      );
    expect(translations[0][4] - translations[1][4]).toBeCloseTo(172 * pt, 10);
    expect(translations[0][5]).toBeCloseTo(translations[1][5], 10);
    expect(JSON.stringify(next)).toBe(before);
  });
  it("prints a 120 mm edge and 100 mm square using physical scale, independent of units and editor state", async () => {
    const { doc } = fixture(120, 100);
    const first = await exportPdf(doc, ["front"], {
      ...options,
      mode: "large",
    });
    const { pdf, streams } = await inspect(first);
    expect(pdf.getPageCount()).toBe(1);
    expect(streams[0]).toContain("0 0 m\n120 0 l");
    expect(streams[0]).toContain("120 0 m\n120 100 l");
    expect(matrices(streams[0]).some((m) => m[0] === pt && m[3] === -pt)).toBe(
      true,
    );
    expect(
      await exportPdf({ ...doc, unitsDisplay: "in" }, ["front"], {
        ...options,
        mode: "large",
      }),
    ).toEqual(first);
    const square = fixture(100, 100).doc;
    expect(
      (await inspect(await exportPdf(square, ["front"], options))).streams[1],
    ).toContain("100 0 m\n100 100 l");
  });
  it("preserves cubic vector controls after rotation and reflection without a second transform", async () => {
    let n = 0;
    let doc = addEllipse(
      emptyDocument("pdf-curve"),
      -30,
      -50,
      120,
      100,
      () => `curve-${++n}`,
    );
    const id = Object.keys(doc.pieces)[0];
    doc = transformPieces(doc, [id], rotationAround(30, { x: 0, y: 0 }));
    doc = transformPieces(doc, [id], {
      a: -1,
      b: 0,
      c: 0,
      d: 1,
      e: 90,
      f: -20,
    });
    const { streams } = await inspect(
      await exportPdf(doc, [id], {
        ...options,
        mode: "large",
        layers: { ...options.layers, cut: false },
      }),
    );
    for (const edge of Object.values(doc.segments)) {
      if (edge.kind !== "cubic") continue;
      expect(streams[0]).toContain(
        `${edge.control1.x} ${edge.control1.y} ${edge.control2.x} ${edge.control2.y} ${doc.points[edge.to].x} ${doc.points[edge.to].y} c`,
      );
    }
  });
  it("uses landscape A4 media boxes and predictable page counts", async () => {
    const { doc } = fixture();
    const { pdf } = await inspect(
      await exportPdf(doc, ["front"], { ...options, orientation: "landscape" }),
    );
    expect(pdf.getPageCount()).toBe(3);
    expect(pdf.getPage(0).getSize()).toEqual({
      width: 297 * pt,
      height: 210 * pt,
    });
  });
  it("independently filters attached fold, grainline, notch, dart and text roles", () => {
    const { doc } = fixture();
    const edges = Object.keys(doc.segments);
    const next = updateSewing(doc, "front", (s) => ({
      ...s,
      edges: { [edges[3]]: { role: "fold" } },
      notches: [
        {
          id: "notch",
          segmentId: edges[0],
          fraction: 0.2,
          style: "V",
          depthMm: 3,
        },
      ],
      marks: [
        {
          id: "grain",
          kind: "grainline",
          position: { x: 40, y: 40 },
          rotation: 45,
          lengthMm: 60,
        },
        {
          id: "fold",
          kind: "fold",
          position: { x: 80, y: 80 },
          rotation: 90,
          lengthMm: 40,
        },
      ],
      darts: [
        {
          id: "dart",
          center: { x: 100, y: 50 },
          rotation: 0,
          intakeMm: 20,
          depthMm: 100,
        },
      ],
    }));
    for (const [key, role] of [
      ["fold", "fold"],
      ["grainline", "grainline"],
      ["notches", "notch"],
      ["darts", "dart"],
    ] as const) {
      const all = pdfDrawing(next, ["front"], options.layers, false);
      expect(all.paths.some((p) => p.role === role)).toBe(true);
      expect(
        pdfDrawing(
          next,
          ["front"],
          { ...options.layers, [key]: false },
          false,
        ).paths.some((p) => p.role === role),
      ).toBe(false);
    }
    expect(
      pdfDrawing(next, ["front"], { ...options.layers, text: false }, false)
        .texts,
    ).toHaveLength(0);
    expect(
      pdfDrawing(
        next,
        ["front"],
        { ...options.layers, stitch: false, cut: false, internal: false },
        false,
      ).paths.every((p) =>
        ["fold", "grainline", "notch", "dart"].includes(p.role),
      ),
    ).toBe(true);
  });
  it("respects internal export flags and clips visible guides to drawing bounds", () => {
    const { doc, id } = fixture();
    let next = addPath(
      doc,
      [
        { x: 30, y: 30 },
        { x: 90, y: 30 },
      ],
      false,
      id,
    );
    const edges = Object.keys(next.segments).filter(
      (key) => !doc.segments[key],
    );
    next = attachInternalPath(next, "front", edges, "inside");
    next = updateSewing(next, "front", (s) => ({
      ...s,
      paths: { inside: { role: "construction", visible: false, export: true } },
    }));
    next.guides.visible = {
      id: "visible",
      axis: "x",
      positionMm: 50,
      locked: true,
      visible: true,
    };
    next.guides.hidden = {
      id: "hidden",
      axis: "y",
      positionMm: 90,
      locked: false,
      visible: false,
    };
    expect(
      pdfDrawing(next, ["front"], options.layers, false).paths.some(
        (p) => p.role === "construction",
      ),
    ).toBe(true);
    const drawing = pdfDrawing(
      next,
      ["front"],
      { ...options.layers, guides: true },
      false,
    );
    expect(drawing.paths.filter((p) => p.role === "guide")).toEqual([
      { path: "M 50 0 L 50 240", role: "guide", dash: [2, 2] },
    ]);
    next.pieces.front.sewing!.paths.inside.export = false;
    expect(
      pdfDrawing(next, ["front"], options.layers, false).paths.some(
        (p) => p.role === "construction",
      ),
    ).toBe(false);
  });
  it("exports free marks and rotated labels only for the explicit annotation scope", async () => {
    const { doc } = fixture();
    doc.annotations.mark = {
      id: "mark",
      kind: "text",
      text: "Front & lining",
      position: { x: -20, y: -30 },
      rotation: 30,
      fontSizeMm: 5,
    };
    const drawing = pdfDrawing(doc, ["front"], options.layers, true);
    expect(drawing.texts[0].rotation).toBe(30);
    expect(
      pdfDrawing(doc, ["front"], options.layers, false).texts,
    ).toHaveLength(0);
    const { streams } = await inspect(
      await exportPdf(doc, ["front"], { ...options, annotations: true }),
    );
    expect(streams.slice(1).join("")).toContain("14.173228346456694 Tf");
  });
  it("rejects missing pieces, empty layers, malformed data and unsupported font characters without mutation", async () => {
    const { doc } = fixture();
    const before = JSON.stringify(doc);
    await expect(exportPdf(doc, ["missing"], options)).rejects.toThrow(
      /no longer exists/,
    );
    await expect(exportPdf(doc, [], options)).rejects.toThrow(/visible piece/);
    const none = Object.fromEntries(
      Object.keys(options.layers).map((key) => [key, false]),
    ) as typeof options.layers;
    await expect(
      exportPdf(doc, ["front"], { ...options, layers: none }),
    ).rejects.toThrow(/layer/);
    await expect(
      exportPdf(
        { ...doc, schemaVersion: 999 } as unknown as typeof doc,
        ["front"],
        options,
      ),
    ).rejects.toThrow(/invalid pattern/);
    expect(JSON.stringify(doc)).toBe(before);
    doc.pieces.front.metadata.notes = "漢字";
    const marked = JSON.stringify(doc);
    await expect(
      exportPdf(doc, ["front"], {
        ...options,
        layers: { ...options.layers, metadata: true },
      }),
    ).rejects.toThrow(/font cannot print/);
    expect(JSON.stringify(doc)).toBe(marked);
    await expect(
      exportPdf(doc, ["front"], {
        ...options,
        layers: { ...options.layers, text: false },
      }),
    ).resolves.toBeInstanceOf(Uint8Array);
  });
});

it("does not allocate paper for disabled remote marks, labels or internal roles", async () => {
  const { doc, id } = fixture();
  let next = updateSewing(doc, "front", (s) => ({
    ...s,
    marks: [
      {
        id: "remote-grain",
        kind: "grainline",
        position: { x: 10000, y: 10000 },
        rotation: 0,
        lengthMm: 100,
        label: "Remote grain",
        fontSizeMm: 1000,
      },
    ],
  }));
  next.annotations.hidden = {
    id: "hidden",
    kind: "text",
    text: "Hidden label",
    position: { x: 1000000, y: 1000000 },
    rotation: 0,
    fontSizeMm: 1000,
  };
  next = addPath(
    next,
    [
      { x: 20000, y: 20000 },
      { x: 20100, y: 20000 },
    ],
    false,
    id,
  );
  const edges = Object.keys(next.segments).filter((key) => !doc.segments[key]);
  next = attachInternalPath(next, "front", edges, "remote-fold");
  next = updateSewing(next, "front", (s) => ({
    ...s,
    paths: { "remote-fold": { role: "fold", visible: true, export: true } },
  }));
  const layers = {
    ...options.layers,
    grainline: false,
    fold: false,
    text: false,
  };
  expect(pdfDrawing(next, ["front"], layers, true).bounds).toEqual({
    min: { x: 0, y: 0 },
    max: { x: 180, y: 240 },
  });
  await expect(
    exportPdf(next, ["front"], { ...options, layers, annotations: true }),
  ).resolves.toBeInstanceOf(Uint8Array);
});
