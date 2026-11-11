import { z } from "zod";
export const outlineEdgeSchema = z
  .object({ segmentId: z.string().min(1), reversed: z.boolean() })
  .strict();
export const pieceMetadataSchema = z
  .object({
    size: z.string().max(120),
    fabric: z.string().max(120),
    cutQuantity: z.number().int().min(1).max(10000),
    onFold: z.boolean(),
    mirroredPair: z.boolean(),
    notes: z.string().max(4000),
    version: z.string().max(120),
  })
  .strict();
export const defaultPieceMetadata = () => ({
  size: "",
  fabric: "",
  cutQuantity: 1,
  onFold: false,
  mirroredPair: false,
  notes: "",
  version: "",
});
export const identityTransform = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
export const pieceTransformSchema = z
  .object({
    a: z.number().finite(),
    b: z.number().finite(),
    c: z.number().finite(),
    d: z.number().finite(),
    e: z.number().finite().min(-1e7).max(1e7),
    f: z.number().finite().min(-1e7).max(1e7),
  })
  .strict()
  .refine(
    (m) =>
      Math.abs(m.a * m.a + m.b * m.b - 1) < 1e-8 &&
      Math.abs(m.c * m.c + m.d * m.d - 1) < 1e-8 &&
      Math.abs(m.a * m.c + m.b * m.d) < 1e-8,
    "Piece transforms support rigid movement and reflection only; scaling changes pattern dimensions.",
  );
export const patternPieceSchema = z
  .object({
    version: z.literal(1),
    id: z.string().min(1),
    name: z.string().trim().min(1).max(120),
    rootSegmentId: z.string().min(1),
    stitchingOutline: z.array(outlineEdgeSchema).min(3),
    internalPaths: z.array(
      z
        .object({
          id: z.string().min(1),
          closed: z.boolean(),
          edges: z.array(outlineEdgeSchema).min(1),
        })
        .strict(),
    ),
    transform: pieceTransformSchema,
    metadata: pieceMetadataSchema,
    locked: z.boolean(),
    visible: z.boolean(),
  })
  .strict();
export type PatternPiece = z.infer<typeof patternPieceSchema>;
