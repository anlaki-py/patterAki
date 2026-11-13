import { z } from "zod";
import type { Bounds } from "../geometry/bounds";

export const PDF_POINTS_PER_MM = 72 / 25.4;
export const pdfLayoutSchema = z
  .object({
    mode: z.enum(["large", "a4"]),
    orientation: z.enum(["portrait", "landscape"]),
    marginMm: z.number().finite().min(0).max(20),
    overlapMm: z.number().finite().min(4).max(50),
  })
  .strict();
export type PdfLayoutOptions = z.infer<typeof pdfLayoutSchema>;
export type PdfTile = {
  number: number;
  row: number;
  column: number;
  left: number;
  top: number;
  width: number;
  height: number;
  pageX: number;
  pageY: number;
};
export type PdfLayout = {
  paperWidth: number;
  paperHeight: number;
  columns: number;
  rows: number;
  tiles: PdfTile[];
};
export const defaultPdfLayout: PdfLayoutOptions = {
  mode: "a4",
  orientation: "portrait",
  marginMm: 10,
  overlapMm: 10,
};
export function planPdfTiles(
  bounds: Bounds,
  input: PdfLayoutOptions,
): PdfLayout {
  const parsed = pdfLayoutSchema.safeParse(input);
  if (!parsed.success)
    throw new Error("Use margins from 0 to 20 mm and overlap from 4 to 50 mm.");
  const o = parsed.data;
  const width = bounds.max.x - bounds.min.x + 2,
    height = bounds.max.y - bounds.min.y + 2;
  if (
    ![
      bounds.min.x,
      bounds.min.y,
      bounds.max.x,
      bounds.max.y,
      width,
      height,
    ].every(Number.isFinite) ||
    width < 2 ||
    height < 2 ||
    (width === 2 && height === 2)
  )
    throw new Error(
      "The PDF drawing must contain geometry with finite dimensions.",
    );
  const left = bounds.min.x - 1,
    top = bounds.min.y - 1;
  if (o.mode === "large") {
    let paperWidth = Math.max(width + 8, 174) + 2 * o.marginMm;
    let paperHeight = height + 170 + 2 * o.marginMm;
    if (o.orientation === "portrait" && paperWidth > paperHeight)
      paperHeight = (paperWidth * 297) / 210;
    else if (o.orientation === "landscape" && paperHeight > paperWidth)
      paperWidth = (paperHeight * 297) / 210;
    if (Math.max(paperWidth, paperHeight) > 5000)
      throw new Error(
        "Large sheets are limited to 5000 mm. Choose tiled A4 or export a smaller drawing.",
      );
    return {
      paperWidth,
      paperHeight,
      columns: 1,
      rows: 1,
      tiles: [
        {
          number: 1,
          row: 0,
          column: 0,
          left,
          top,
          width,
          height,
          pageX: o.marginMm + 4,
          pageY: o.marginMm + 8,
        },
      ],
    };
  }
  const [paperWidth, paperHeight] =
    o.orientation === "portrait" ? [210, 297] : [297, 210];
  // Furniture stays inside the printable margins, separately from the clipped drawing.
  const tileWidth = paperWidth - 2 * o.marginMm - 8;
  const tileHeight = paperHeight - 2 * o.marginMm - 24;
  const stepX = tileWidth - o.overlapMm,
    stepY = tileHeight - o.overlapMm;
  const columns = Math.max(1, Math.ceil((width - o.overlapMm - 1e-9) / stepX));
  const rows = Math.max(1, Math.ceil((height - o.overlapMm - 1e-9) / stepY));
  if (columns * rows > 200)
    throw new Error(
      "This export needs more than 200 tiles. Export a smaller drawing or use a large sheet.",
    );
  const tiles: PdfTile[] = [];
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++)
      tiles.push({
        number: tiles.length + 1,
        row,
        column,
        left: left + column * stepX,
        top: top + row * stepY,
        width: tileWidth,
        height: tileHeight,
        pageX: o.marginMm + 4,
        pageY: o.marginMm + 12,
      });
  return { paperWidth, paperHeight, columns, rows, tiles };
}

/** Matching crosses use identical world positions on both sides of each overlap. */
export function tileRegistration(
  tile: PdfTile,
  layout: PdfLayout,
  overlap: number,
) {
  const result: { x: number; y: number; axis: "x" | "y" }[] = [];
  const vertical = (x: number) => {
    result.push(
      { x, y: tile.top + 4, axis: "x" },
      { x, y: tile.top + tile.height - 4, axis: "x" },
    );
  };
  const horizontal = (y: number) => {
    result.push(
      { x: tile.left + 4, y, axis: "y" },
      { x: tile.left + tile.width - 4, y, axis: "y" },
    );
  };
  if (tile.column > 0) vertical(tile.left + overlap / 2);
  if (tile.column < layout.columns - 1)
    vertical(tile.left + tile.width - overlap / 2);
  if (tile.row > 0) horizontal(tile.top + overlap / 2);
  if (tile.row < layout.rows - 1)
    horizontal(tile.top + tile.height - overlap / 2);
  return result;
}
