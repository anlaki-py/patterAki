import { PDFPage, rgb } from "pdf-lib";
import {
  PDF_POINTS_PER_MM as pt,
  tileRegistration,
  type PdfTile,
  type PdfLayout,
} from "./tiling";
const gray = rgb(0.45, 0.45, 0.45);
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
