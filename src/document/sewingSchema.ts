import { z } from "zod";
const id = z.string().min(1);
const mm = z.number().finite().min(-1e7).max(1e7);
const point = z.object({ x: mm, y: mm }).strict();
export const edgeRoleSchema = z.enum(["seam", "hem", "raw-edge", "fold"]);
export const internalRoleSchema = z.enum([
  "construction",
  "dart",
  "fold",
  "stitch",
  "placement",
]);
export const sewingSchema = z
  .object({
    edges: z.record(
      id,
      z
        .object({
          role: edgeRoleSchema,
          allowanceMm: z.number().finite().min(0).max(1000).optional(),
        })
        .strict(),
    ),
    paths: z.record(
      id,
      z
        .object({
          role: internalRoleSchema,
          visible: z.boolean(),
          export: z.boolean(),
        })
        .strict(),
    ),
    notches: z.array(
      z
        .object({
          id,
          segmentId: id,
          fraction: z.number().finite().min(0).max(1),
          style: z.enum(["single", "double", "V", "T"]),
          depthMm: z.number().finite().positive().max(100),
        })
        .strict(),
    ),
    marks: z.array(
      z
        .object({
          id,
          kind: z.enum(["grainline", "fold"]),
          label: z.string().max(120).optional(),
          fontSizeMm: z.number().finite().min(1).max(1000).optional(),
          position: point,
          rotation: z.number().finite().min(-360).max(360),
          lengthMm: z.number().finite().min(1).max(100000),
          segmentId: id.optional(),
          fraction: z.number().finite().min(0).max(1).optional(),
        })
        .strict(),
    ),
    darts: z.array(
      z
        .object({
          id,
          center: point,
          rotation: z.number().finite().min(-360).max(360),
          intakeMm: z.number().finite().positive().max(10000),
          depthMm: z.number().finite().positive().max(10000),
        })
        .strict(),
    ),
  })
  .strict();
export type Sewing = z.infer<typeof sewingSchema>;
export const emptySewing = (): Sewing => ({
  edges: {},
  paths: {},
  notches: [],
  marks: [],
  darts: [],
});
