import { z } from "zod";
export const seamAllowanceSchema = z
  .object({
    widthMm: z.number().finite().min(0).max(1000),
    join: z.enum(["miter", "round", "bevel"]),
    miterLimit: z.number().finite().min(1).max(20),
  })
  .strict();
export type SeamAllowance = z.infer<typeof seamAllowanceSchema>;
export const defaultSeamAllowance = (): SeamAllowance => ({
  widthMm: 0,
  join: "miter",
  miterLimit: 4,
});
