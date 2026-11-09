import { expect, it } from "vitest";
import {
  defaultSettings,
  parseEditorSettings,
  settingsFromState,
  validateMajorEvery,
  validateNudge,
  validatePickup,
  validateSpacing,
} from "./settings";

it("F01 defaults to 10 mm grid snapping with a 5x major interval", () => {
  expect(defaultSettings.gridSpacingMm).toBe(10);
  expect(defaultSettings.gridMajorEvery).toBe(5);
  expect(defaultSettings.nudgeMm).toBe(1);
  expect(defaultSettings.snapModes.grid).toBe(true);
});

it("F02 keeps grid visibility and grid snapping independent", () => {
  const parsed = parseEditorSettings({
    ...defaultSettings,
    grid: false,
    gridSnap: true,
  });
  expect(parsed.grid).toBe(false);
  expect(parsed.gridSnap).toBe(true);
  const inverse = parseEditorSettings({
    ...defaultSettings,
    grid: true,
    gridSnap: false,
  });
  expect(inverse.grid).toBe(true);
  expect(inverse.gridSnap).toBe(false);
});

it("F03 rejects invalid spacing, intervals, radii and nudge steps", () => {
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
    expect(() => validateSpacing(value)).toThrow();
  for (const value of [0, 1.5, 101])
    expect(() => validateMajorEvery(value)).toThrow();
  expect(() => validatePickup(1, "mouse")).toThrow();
  expect(() => validatePickup(33, "mouse")).toThrow();
  expect(() => validatePickup(3, "touch")).toThrow();
  expect(() => validatePickup(49, "touch")).toThrow();
  expect(() => validateNudge(0)).toThrow();
  expect(validateSpacing(2.5)).toBe(2.5);
  expect(validateMajorEvery(10)).toBe(10);
  expect(validatePickup(8, "mouse")).toBe(8);
  expect(validateNudge(0.1)).toBe(0.1);
});

it("merges older saved settings with current defaults and extracts state", () => {
  const parsed = parseEditorSettings({
    snap: false,
    gridSpacingMm: 2.5,
    snapModes: { endpoints: false },
  });
  expect(parsed.snap).toBe(false);
  expect(parsed.gridSpacingMm).toBe(2.5);
  expect(parsed.snapModes.endpoints).toBe(false);
  expect(parsed.snapModes.intersections).toBe(true);
  expect(parsed.showRulers).toBe(true);
  const state = {
    ...defaultSettings,
    document: {},
    selected: [],
    snapModes: { ...defaultSettings.snapModes, grid: false },
  };
  expect(settingsFromState(state)).toMatchObject({
    snapModes: { grid: false },
    nudgeMm: 1,
  });
});
