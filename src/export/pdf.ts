import {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
  PDFName,
  pushGraphicsState,
  popGraphicsState,
  rectangle,
  clip,
  endPath,
} from "pdf-lib";
import type { PatternDocument } from "../document/schema";
import { transformMarkPoint } from "../geometry/marks";
import { pdfDrawing, type PdfLayers } from "./pdfDrawing";
import {
  PDF_POINTS_PER_MM as pt,
  planPdfTiles,
  type PdfLayoutOptions,
} from "./tiling";
import { calibration, pageText, tileFurniture } from "./pdfFurniture";

export type PdfExportOptions = PdfLayoutOptions & {
  layers: PdfLayers;
  annotations: boolean;
};
export async function exportPdf(
  doc: PatternDocument,
  pieceIds: string[],
  options: PdfExportOptions,
): Promise<Uint8Array> {
  const drawing = pdfDrawing(
    doc,
    pieceIds,
    options.layers,
    options.annotations,
  );
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  // Fail explicitly rather than dropping labels the built-in vector font cannot encode.
  for (const text of drawing.texts) {
    let width: number;
    try {
      width = font.widthOfTextAtSize(text.text, text.size * pt) / pt;
    } catch (cause) {
      throw new Error(
        "A label contains characters the PDF font cannot print. Edit that label, turn off Text and labels, or export SVG.",
        { cause },
      );
    }
    for (const corner of [
      { x: 0, y: -text.size },
      { x: width, y: -text.size },
      { x: width, y: text.size * 0.3 },
      { x: 0, y: text.size * 0.3 },
    ]) {
      const p = transformMarkPoint(corner, text.position, text.rotation);
      drawing.bounds.min.x = Math.min(drawing.bounds.min.x, p.x);
      drawing.bounds.min.y = Math.min(drawing.bounds.min.y, p.y);
      drawing.bounds.max.x = Math.max(drawing.bounds.max.x, p.x);
      drawing.bounds.max.y = Math.max(drawing.bounds.max.y, p.y);
    }
  }
  const layout = planPdfTiles(drawing.bounds, {
    mode: options.mode,
    orientation: options.orientation,
    marginMm: options.marginMm,
    overlapMm: options.overlapMm,
  });
  pdf.setTitle(doc.name);
  pdf.setCreator("PatternAki");
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));
  pdf.catalog.set(
    PDFName.of("ViewerPreferences"),
    pdf.context.obj({ PrintScaling: "None" }),
  );
  if (options.mode === "a4") {
    const page = pdf.addPage([layout.paperWidth * pt, layout.paperHeight * pt]);
    pageText(
      page,
      font,
      "PatternAki - calibration and assembly",
      options.marginMm + 4,
      options.marginMm + 5,
      3.5,
    );
    calibration(page, font, options.marginMm, options.marginMm + 16);
    pageText(
      page,
      font,
      `${layout.rows} rows x ${layout.columns} columns, ${layout.tiles.length} tiles. Assemble in row-major order.`,
      options.marginMm + 4,
      options.marginMm + 162,
      2.5,
    );
    pageText(
      page,
      font,
      "Overlay shared bands; match crosses before trimming and taping.",
      options.marginMm + 4,
      options.marginMm + 168,
      2.5,
    );
  }
  for (const tile of layout.tiles) {
    const page = pdf.addPage([layout.paperWidth * pt, layout.paperHeight * pt]);
    const x = (tile.pageX - tile.left) * pt,
      y = (layout.paperHeight - tile.pageY + tile.top) * pt;
    page.pushOperators(
      pushGraphicsState(),
      rectangle(
        tile.pageX * pt,
        (layout.paperHeight - tile.pageY - tile.height) * pt,
        tile.width * pt,
        tile.height * pt,
      ),
      clip(),
      endPath(),
    );
    for (const path of drawing.paths)
      page.drawSvgPath(path.path, {
        x,
        y,
        scale: pt,
        borderWidth: path.role === "cut" ? 0.35 : 0.25,
        borderColor: rgb(0, 0, 0),
        borderDashArray:
          path.dash ??
          (path.role === "stitch" || path.role === "seam" ? [4, 2] : []),
      });
    for (const c of drawing.circles)
      page.drawCircle({
        x: x + c.center.x * pt,
        y: y - c.center.y * pt,
        size: c.radius * pt,
        borderWidth: 0.25 * pt,
        borderColor: rgb(0, 0, 0),
      });
    for (const t of drawing.texts)
      page.drawText(t.text, {
        x: x + t.position.x * pt,
        y: y - t.position.y * pt,
        size: t.size * pt,
        font,
        rotate: degrees(-t.rotation),
        color: rgb(0, 0, 0),
      });
    page.pushOperators(popGraphicsState());
    if (options.mode === "a4")
      tileFurniture(
        page,
        font,
        tile,
        layout,
        options.marginMm,
        options.overlapMm,
      );
    else {
      pageText(
        page,
        font,
        "PatternAki - one large sheet, 1:1",
        options.marginMm + 4,
        options.marginMm + 5,
      );
      calibration(page, font, options.marginMm, tile.pageY + tile.height + 20);
    }
  }
  return pdf.save({ useObjectStreams: false });
}
