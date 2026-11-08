import { z } from "zod";
import { annotationInRange } from "./annotationGeometry";
import { annotationSchema } from "./annotationSchema";
const coordinate = z.number().finite().min(-1e7).max(1e7);
const point = z.object({ x: coordinate, y: coordinate }).strict();
const lineSegment = z
  .object({
    id: z.string().min(1),
    kind: z.literal("line"),
    from: z.string(),
    to: z.string(),
  })
  .strict();
const segment = z.discriminatedUnion("kind", [
  lineSegment,
  lineSegment.extend({
    kind: z.literal("cubic"),
    control1: point,
    control2: point,
  }),
]);
const version2Base = z
  .object({
    schemaVersion: z.literal(2),
    id: z.string().min(1),
    name: z.string().trim().min(1).max(120),
    points: z.record(z.string(), point),
    segments: z.record(z.string(), segment),
    unitsDisplay: z.enum(["mm", "cm", "in"]),
  })
  .strict();
function validateSegments(
  doc: Pick<z.infer<typeof version2Base>, "points" | "segments">,
  ctx: z.RefinementCtx,
) {
  for (const [id, edge] of Object.entries(doc.segments)) {
    const a = doc.points[edge.from],
      b = doc.points[edge.to];
    if (
      id !== edge.id ||
      !Object.hasOwn(doc.points, edge.from) ||
      !Object.hasOwn(doc.points, edge.to) ||
      !a ||
      !b ||
      Math.hypot(a.x - b.x, a.y - b.y) < 1e-9
    )
      ctx.addIssue({
        code: "custom",
        message: `Invalid endpoints for segment ${id}`,
      });
  }
}
const version2Schema = version2Base.superRefine(validateSegments);
const version1Schema = z
  .object({
    ...version2Schema.shape,
    schemaVersion: z.literal(1),
    segments: z.record(z.string(), lineSegment),
  })
  .strict();
const currentSchema = z
  .object({
    ...version2Base.shape,
    schemaVersion: z.literal(3),
    annotations: z.record(z.string(), annotationSchema),
  })
  .strict()
  .superRefine(validateSegments)
  .superRefine((doc, ctx) => {
    for (const [id, mark] of Object.entries(doc.annotations)) {
      if (
        id !== mark.id ||
        Object.hasOwn(doc.segments, id) ||
        !annotationInRange(mark)
      )
        ctx.addIssue({
          code: "custom",
          message: `Invalid or duplicate annotation ID ${id}`,
        });
    }
  });
// Validate each historical format before adding fields; malformed or unknown
// versions must never lose data by being relabelled as the current format.
export const documentSchema = z.preprocess((input) => {
  if (!input || typeof input !== "object" || !("schemaVersion" in input))
    return input;
  let candidate = input;
  if (candidate.schemaVersion === 1) {
    const legacy = version1Schema.safeParse(candidate);
    if (!legacy.success) return input;
    candidate = { ...legacy.data, schemaVersion: 2 };
  }
  if (candidate.schemaVersion === 2) {
    const legacy = version2Schema.safeParse(candidate);
    if (!legacy.success) return input;
    return { ...legacy.data, schemaVersion: 3, annotations: {} };
  }
  return candidate;
}, currentSchema);
export type PatternDocument = z.infer<typeof documentSchema>;
export const emptyDocument = (id: string): PatternDocument => ({
  schemaVersion: 3,
  annotations: {},
  id,
  name: "Untitled pattern",
  points: {},
  segments: {},
  unitsDisplay: "cm",
});
export function parseProject(text: string): PatternDocument {
  if (text.length > 10_000_000)
    throw new Error("Project exceeds the 10 MB import limit.");
  return documentSchema.parse(JSON.parse(text));
}
export const unitFactor = { mm: 1, cm: 10, in: 25.4 };
export function formatLength(
  mm: number,
  units: PatternDocument["unitsDisplay"],
): string {
  return `${Number((mm / unitFactor[units]).toFixed(2))} ${units}`;
}
