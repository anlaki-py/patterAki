import { fastenerSchemas } from "./fastenerSchema";
import { z } from "zod";
const coordinate = z.number().finite().min(-1e7).max(1e7);
const base = {
  id: z.string().min(1),
  position: z.object({ x: coordinate, y: coordinate }).strict(),
  rotation: z.number().finite().min(-360).max(360),
};
const fontSizeMm = z.number().finite().min(1).max(1000);
const directional = {
  ...base,
  lengthMm: z.number().finite().min(1).max(100000),
  label: z.string().max(120),
  fontSizeMm,
};
export const legacyAnnotationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...base,
      kind: z.literal("text"),
      text: z
        .string()
        .min(1)
        .max(1000)
        .refine((v) => !!v.trim(), "Enter some text."),
      fontSizeMm,
    })
    .strict(),
  z.object({ ...directional, kind: z.literal("arrow") }).strict(),
  z.object({ ...directional, kind: z.literal("grainline") }).strict(),
  z.object({ ...directional, kind: z.literal("fold") }).strict(),
  z
    .object({
      ...base,
      kind: z.literal("drill"),
      sizeMm: z.number().finite().min(1).max(1000),
    })
    .strict(),
]);
export const labelPositionSchema = z.enum(["top", "bottom", "inside"]);
export type LabelPosition = z.infer<typeof labelPositionSchema>;
export const annotationSchema = z.discriminatedUnion("kind", [
  legacyAnnotationSchema.options[0],
  legacyAnnotationSchema.options[1],
  legacyAnnotationSchema.options[2].safeExtend({
    labelPosition: labelPositionSchema.optional(),
  }),
  legacyAnnotationSchema.options[3],
  legacyAnnotationSchema.options[4],
  ...fastenerSchemas.map((schema) => schema.safeExtend(base)),
]);
export type Annotation = z.infer<typeof annotationSchema>;
export type AnnotationKind = Annotation["kind"];
