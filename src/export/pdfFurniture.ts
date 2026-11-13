import { PDFPage, PDFFont, rgb } from "pdf-lib";
import {
  PDF_POINTS_PER_MM as pt,
  tileRegistration,
  type PdfTile,
  type PdfLayout,
} from "./tiling";
const black = rgb(0, 0, 0),
  gray = rgb(0.45, 0.45, 0.45);
function pageLine(
  page: PDFPage,
  x: number,
  y: number,
  endX: number,
  endY: number,
  dashed = false,
) {
  page.drawLine({
    start: { x: x * pt, y: page.getHeight() - y * pt },
    end: { x: endX * pt, y: page.getHeight() - endY * pt },
    thickness: 0.2 * pt,
    color: gray,
    dashArray: dashed ? [2 * pt, 2 * pt] : undefined,
  });
}
export function tileFurniture(
  page: PDFPage,
  tile: PdfTile,
  layout: PdfLayout,
  overlap: number,
) {
  // The frame and seam crosses are printable furniture, outside model geometry.
  page.drawRectangle({
    x: tile.pageX * pt,
    y: (layout.paperHeight - tile.pageY - tile.height) * pt,
    width: tile.width * pt,
    height: tile.height * pt,
    borderWidth: 0.12 * pt,
    borderColor: gray,
    borderDashArray: [2 * pt, 2 * pt],
  });
  const seen = new Set<string>();
  for (const mark of tileRegistration(tile, layout, overlap)) {
    const x = tile.pageX + mark.x - tile.left,
      y = tile.pageY + mark.y - tile.top;
    pageLine(page, x - 1.5, y, x + 1.5, y);
    pageLine(page, x, y - 1.5, x, y + 1.5);
    const key = `${mark.axis}-${mark.axis === "x" ? x : y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (mark.axis === "x")
      pageLine(page, x, tile.pageY, x, tile.pageY + tile.height, true);
    else pageLine(page, tile.pageX, y, tile.pageX + tile.width, y, true);
  }
}

function pageText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size = 3,
) {
  page.drawText(text, {
    x: x * pt,
    y: page.getHeight() - y * pt,
    size: size * pt,
    font,
    color: black,
  });
}
export function calibration(
  page: PDFPage,
  font: PDFFont,
  margin: number,
  top: number,
) {
  const x = margin + 4;
  pageText(page, font, "Calibration: measure before cutting", x, top - 6, 3.5);
  page.drawRectangle({
    x: x * pt,
    y: page.getHeight() - (top + 100) * pt,
    width: 100 * pt,
    height: 100 * pt,
    borderWidth: 0.25 * pt,
    borderColor: black,
  });
  pageText(page, font, "100 x 100 mm", x + 6, top + 12, 4);
  if (page.getWidth() / pt - 2 * margin >= 170) {
    page.drawRectangle({
      x: (x + 114) * pt,
      y: page.getHeight() - (top + 50) * pt,
      width: 50 * pt,
      height: 50 * pt,
      borderWidth: 0.25 * pt,
      borderColor: black,
    });
    pageText(page, font, "50 x 50 mm", x + 116, top + 10);
  }
  const rulerY = top + 112;
  pageLine(page, x, rulerY, x + 100, rulerY);
  for (let tick = 0; tick <= 100; tick += 10) {
    pageLine(
      page,
      x + tick,
      rulerY,
      x + tick,
      rulerY + (tick % 50 === 0 ? 4 : 2),
    );
    pageText(
      page,
      font,
      String(tick),
      x + tick - (tick ? 2 : 0),
      rulerY + 9,
      2.5,
    );
  }
  pageText(page, font, "100 mm reference ruler", x, rulerY + 15);
  pageText(
    page,
    font,
    "Print at actual size / 100%. Disable Fit to page.",
    x,
    top + 134,
    2.5,
  );
  pageText(
    page,
    font,
    "Measure the square. Printer-driver scaling can change paper output.",
    x,
    top + 140,
    2.3,
  );
}
