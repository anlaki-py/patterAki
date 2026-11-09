import { z } from "zod";
export const snapModesSchema = z
  .object({
    endpoints: z.boolean(),
    intersections: z.boolean(),
    midpoints: z.boolean(),
    edges: z.boolean(),
    alignments: z.boolean(),
    perpendicular: z.boolean(),
    guides: z.boolean(),
    grid: z.boolean(),
  })
  .strict();
export type SnapModes = z.infer<typeof snapModesSchema>;
export const editorSettingsSchema = z
  .object({
    snap: z.boolean(),
    grid: z.boolean(),
    gridSnap: z.boolean(),
    gridSpacingMm: z.number().finite().min(0.1).max(1000),
    gridMajorEvery: z.number().int().min(1).max(100),
    snapModes: snapModesSchema,
    mouseRadiusPx: z.number().finite().min(2).max(32),
    touchRadiusPx: z.number().finite().min(4).max(48),
    releaseMultiplier: z.number().finite().min(1).max(3),
    showRulers: z.boolean(),
    showGuides: z.boolean(),
    snapGuides: z.boolean(),
    nudgeMm: z.number().finite().min(0.01).max(1000),
  })
  .strict();
export type EditorSettings = z.infer<typeof editorSettingsSchema>;
export const defaultSettings: EditorSettings = {
  snap: true,
  grid: true,
  gridSnap: true,
  gridSpacingMm: 10,
  gridMajorEvery: 5,
  snapModes: {
    endpoints: true,
    intersections: true,
    midpoints: true,
    edges: true,
    alignments: true,
    perpendicular: true,
    guides: true,
    grid: true,
  },
  mouseRadiusPx: 8,
  touchRadiusPx: 16,
  releaseMultiplier: 1.5,
  showRulers: true,
  showGuides: true,
  snapGuides: true,
  nudgeMm: 1,
};
// Preferences evolve independently of documents. Missing fields fall back to
// current defaults so an older settings row never breaks editor startup.
export function parseEditorSettings(input: unknown): EditorSettings {
  if (!input || typeof input !== "object") return { ...defaultSettings };
  const merged = {
    ...defaultSettings,
    ...input,
    snapModes: {
      ...defaultSettings.snapModes,
      ...((input as { snapModes?: unknown }).snapModes ?? {}),
    },
  };
  return editorSettingsSchema.parse(merged);
}
export function settingsFromState(
  state: EditorSettings & Record<string, unknown>,
): EditorSettings {
  return editorSettingsSchema.parse({
    snap: state.snap,
    grid: state.grid,
    gridSnap: state.gridSnap,
    gridSpacingMm: state.gridSpacingMm,
    gridMajorEvery: state.gridMajorEvery,
    snapModes: state.snapModes,
    mouseRadiusPx: state.mouseRadiusPx,
    touchRadiusPx: state.touchRadiusPx,
    releaseMultiplier: state.releaseMultiplier,
    showRulers: state.showRulers,
    showGuides: state.showGuides,
    snapGuides: state.snapGuides,
    nudgeMm: state.nudgeMm,
  });
}
export function validateSpacing(value: number): number {
  if (!Number.isFinite(value) || value < 0.1 || value > 1000)
    throw new Error("Grid spacing must be between 0.1 and 1000 mm.");
  return value;
}
export function validateMajorEvery(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 100)
    throw new Error(
      "Major grid interval must be a whole number from 1 to 100.",
    );
  return value;
}
export function validatePickup(value: number, kind: "mouse" | "touch"): number {
  const min = kind === "mouse" ? 2 : 4;
  const max = kind === "mouse" ? 32 : 48;
  if (!Number.isFinite(value) || value < min || value > max)
    throw new Error(
      `${kind === "mouse" ? "Mouse" : "Touch"} pickup must be between ${min} and ${max} px.`,
    );
  return value;
}
export function validateNudge(value: number): number {
  if (!Number.isFinite(value) || value < 0.01 || value > 1000)
    throw new Error("Nudge step must be between 0.01 and 1000 mm.");
  return value;
}
