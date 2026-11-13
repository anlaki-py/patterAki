import { referenceDimensions } from "../document/referenceSchema";
import type { PatternDocument } from "../document/schema";
import { referenceCanvas, referenceTransform } from "../editor/referenceImage";
import { escapeXml } from "./xml";
/** Explicit review-only raster underlay; manufacturing exporters never call this. */
export async function reviewSvg(svg: string, doc: PatternDocument) {
  const images = await Promise.all(
    Object.values(doc.references ?? {})
      .filter((r) => r.visible)
      .map(
        async (r) =>
          `<image data-reference="${escapeXml(r.name)}" href="${(await referenceCanvas(r)).toDataURL("image/png")}" width="${referenceDimensions(r).width}" height="${referenceDimensions(r).height}" opacity="${r.opacity}" transform="${referenceTransform(r)}"/>`,
      ),
  );
  return svg.replace(
    "><g",
    `><title>Review only: reference photos may be distorted or uncalibrated</title><g data-layer="review-underlay">${images.join("")}</g><g`,
  );
}
