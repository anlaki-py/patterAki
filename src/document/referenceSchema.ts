import { z } from "zod";
import { calibrationScale, validateCorners } from "../geometry/perspective";
const pixel = z
  .object({
    x: z.number().finite().min(0).max(8192),
    y: z.number().finite().min(0).max(8192),
  })
  .strict();
export const referenceSchema = z
  .object({
    id: z.string().min(1),
    assetId: z.string().min(1),
    name: z.string().min(1).max(255),
    widthPx: z.number().int().min(1).max(8192),
    heightPx: z.number().int().min(1).max(8192),
    x: z.number().finite().min(-1e7).max(1e7),
    y: z.number().finite().min(-1e7).max(1e7),
    mmPerPixel: z.number().finite().positive().max(1e5),
    rotation: z.number().finite().min(-360).max(360),
    opacity: z.number().min(0).max(1),
    locked: z.boolean(),
    visible: z.boolean(),
    calibration: z
      .object({
        a: pixel,
        b: pixel,
        distanceMm: z.number().positive().max(1e7),
      })
      .strict()
      .optional(),
    corners: z.array(pixel).length(4).optional(),
    perspectiveSize: z
      .object({
        widthMm: z.number().positive().max(1e7),
        heightMm: z.number().positive().max(1e7),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.widthPx * r.heightPx > 16_000_000)
      ctx.addIssue({
        code: "custom",
        message: "Image exceeds 16 million pixels.",
      });
    const size = referenceDimensions(r);
    if (
      size.width > 8192 ||
      size.height > 8192 ||
      size.width * size.height > 16_000_000
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Corrected image exceeds 8192 pixels per side or 16 million pixels.",
      });
    if (r.perspectiveSize && !r.corners)
      ctx.addIssue({
        code: "custom",
        message: "Perspective size needs four corners.",
      });
    if (r.calibration) {
      try {
        const { a, b, distanceMm } = r.calibration;
        if ([a, b].some((p) => p.x > size.width || p.y > size.height))
          throw new Error("Calibration points exceed image bounds.");
        const scale = calibrationScale(a, b, distanceMm);
        if (Math.abs(scale - r.mmPerPixel) > 1e-9 * Math.max(1, scale))
          throw new Error("Calibration does not match the image scale.");
      } catch (e) {
        ctx.addIssue({ code: "custom", message: (e as Error).message });
      }
    }
    const angle = (r.rotation * Math.PI) / 180;
    for (const [x, y] of [
      [0, 0],
      [size.width, 0],
      [size.width, size.height],
      [0, size.height],
    ]) {
      if (
        Math.abs(
          r.x + r.mmPerPixel * (x * Math.cos(angle) - y * Math.sin(angle)),
        ) > 1e7 ||
        Math.abs(
          r.y + r.mmPerPixel * (x * Math.sin(angle) + y * Math.cos(angle)),
        ) > 1e7
      )
        ctx.addIssue({
          code: "custom",
          message: "Reference placement exceeds coordinate bounds.",
        });
    }
    if (r.corners) {
      try {
        validateCorners(r.corners);
        if (r.corners.some((p) => p.x > r.widthPx || p.y > r.heightPx))
          throw new Error("Corners exceed image bounds.");
      } catch (e) {
        ctx.addIssue({ code: "custom", message: (e as Error).message });
      }
    }
  });
export type ReferenceImage = z.infer<typeof referenceSchema>;

export function referenceDimensions(r: {
  widthPx: number;
  heightPx: number;
  corners?: unknown;
  perspectiveSize?: { widthMm: number; heightMm: number };
}) {
  return {
    width: r.widthPx,
    height:
      r.corners && r.perspectiveSize
        ? Math.max(
            1,
            Math.round(
              (r.widthPx * r.perspectiveSize.heightMm) /
                r.perspectiveSize.widthMm,
            ),
          )
        : r.heightPx,
  };
}
