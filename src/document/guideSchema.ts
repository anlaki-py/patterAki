import { z } from "zod";
export const coordinateLimit = 1e7;
export const guideCoordinateSchema = z
  .number()
  .finite()
  .min(-coordinateLimit)
  .max(coordinateLimit);
export const constructionGuideSchema = z
  .object({
    id: z.string().min(1),
    axis: z.enum(["x", "y"]),
    positionMm: guideCoordinateSchema,
    locked: z.boolean(),
    visible: z.boolean(),
  })
  .strict();
export type ConstructionGuide = z.infer<typeof constructionGuideSchema>;
