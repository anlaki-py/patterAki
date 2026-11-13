import { z } from "zod";
const dimension = z.number().finite().min(0.1).max(1000);
export const fastenerSchemas = [
  z
    .object({
      kind: z.literal("button"),
      shape: z.enum(["ellipse", "rectangle"]),
      widthMm: dimension,
      heightMm: dimension,
      holes: z.enum(["none", "two", "four"]),
      holeDiameterMm: dimension,
      holeSpacingMm: dimension,
    })
    .strict()
    .superRefine((mark, ctx) => {
      if (mark.holes === "none") return;
      // Keep every hole inside the outline, including all four diagonal holes.
      const x = (mark.holeSpacingMm + mark.holeDiameterMm) / mark.widthMm;
      const y =
        mark.holes === "four"
          ? (mark.holeSpacingMm + mark.holeDiameterMm) / mark.heightMm
          : mark.holeDiameterMm / mark.heightMm;
      if (mark.shape === "ellipse" ? x * x + y * y > 1 : x > 1 || y > 1)
        ctx.addIssue({
          code: "custom",
          message:
            "Button holes must fit inside the button. Reduce hole spacing or diameter.",
        });
    }),
  z
    .object({
      kind: z.literal("buttonhole"),
      style: z.enum(["straight", "rounded", "keyhole"]),
      lengthMm: dimension,
      widthMm: dimension,
      eyeLengthMm: dimension,
      eyeWidthMm: dimension,
    })
    .strict()
    .superRefine((mark, ctx) => {
      if (mark.lengthMm <= mark.widthMm)
        ctx.addIssue({
          code: "custom",
          message: "Buttonhole length must exceed slit width.",
        });
      if (
        mark.style === "keyhole" &&
        (mark.eyeWidthMm <= mark.widthMm ||
          mark.lengthMm <= mark.eyeLengthMm + mark.widthMm)
      )
        ctx.addIssue({
          code: "custom",
          message:
            "The eye must be wider than the slit and leave room within the overall length.",
        });
    }),
  z
    .object({
      kind: z.literal("eyelet"),
      diameterMm: dimension,
      openingMm: dimension,
    })
    .strict()
    .refine(
      (m) => m.openingMm < m.diameterMm,
      "Eyelet opening must be smaller than its outer diameter.",
    ),
  z
    .object({
      kind: z.literal("snap"),
      diameterMm: dimension,
      openingMm: dimension,
    })
    .strict()
    .refine(
      (m) => m.openingMm < m.diameterMm,
      "Snap center must be smaller than its outer diameter.",
    ),
  z
    .object({
      kind: z.literal("bartack"),
      lengthMm: dimension,
      widthMm: dimension,
      stitches: z.number().int().min(2).max(40),
    })
    .strict(),
] as const;
export const fastenerSchema = z.discriminatedUnion("kind", fastenerSchemas);
export type Fastener = z.infer<typeof fastenerSchema>;
export const isFastener = (mark: { kind: string }): mark is Fastener =>
  ["button", "buttonhole", "eyelet", "snap", "bartack"].includes(mark.kind);
