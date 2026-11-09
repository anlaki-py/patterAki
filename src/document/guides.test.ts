import { expect, it } from "vitest";
import { addGuide, deleteGuide, moveGuide, updateGuide } from "./guides";
import { documentSchema, emptyDocument, parseProject } from "./schema";

it("adds, updates, moves, hides, locks and deletes guides immutably", () => {
  const original = emptyDocument("guides");
  const added = addGuide(original, "x", -12.5, "guide-a");
  expect(original.guides).toEqual({});
  expect(added.guides["guide-a"]).toEqual({
    id: "guide-a",
    axis: "x",
    positionMm: -12.5,
    locked: false,
    visible: true,
  });
  const moved = moveGuide(added, "guide-a", 42.25);
  expect(moved).not.toBe(added);
  expect(added.guides["guide-a"].positionMm).toBe(-12.5);
  expect(moved.guides["guide-a"].positionMm).toBe(42.25);
  const locked = updateGuide(moved, "guide-a", {
    locked: true,
    visible: false,
  });
  expect(locked.guides["guide-a"]).toMatchObject({
    locked: true,
    visible: false,
  });
  expect(deleteGuide(locked, "guide-a").guides).toEqual({});
});

it("rejects duplicate item IDs and invalid guide positions", () => {
  const doc = addGuide(emptyDocument("guides"), "y", 10, "same");
  expect(() => addGuide(doc, "x", 10, "same")).toThrow("already exists");
  expect(() => moveGuide(doc, "same", Number.NaN)).toThrow();
  expect(() => moveGuide(doc, "same", Number.POSITIVE_INFINITY)).toThrow();
  expect(() => moveGuide(doc, "missing", 10)).toThrow("no longer exists");
  expect(() =>
    documentSchema.parse({
      ...doc,
      guides: {
        same: {
          id: "other",
          axis: "x",
          positionMm: 2,
          locked: false,
          visible: true,
        },
      },
    }),
  ).toThrow();
  expect(() =>
    documentSchema.parse({
      ...doc,
      guides: {
        same: {
          id: "same",
          axis: "diagonal",
          positionMm: 2,
          locked: false,
          visible: true,
        },
      },
    }),
  ).toThrow();
});

it("round-trips guides through editable JSON and migrates a version 3 project", () => {
  const doc = addGuide(emptyDocument("round-trip"), "x", -240.75, "v");
  expect(parseProject(JSON.stringify(doc))).toEqual(doc);
  const version3 = {
    schemaVersion: 3,
    id: doc.id,
    name: doc.name,
    points: doc.points,
    segments: doc.segments,
    unitsDisplay: doc.unitsDisplay,
    annotations: doc.annotations,
  };
  const migrated = parseProject(JSON.stringify(version3));
  expect(migrated).toEqual({ ...doc, guides: {}, pieces: {} });
  expect(migrated.schemaVersion).toBe(5);
  const version2 = {
    schemaVersion: 2,
    id: doc.id,
    name: doc.name,
    points: doc.points,
    segments: doc.segments,
    unitsDisplay: doc.unitsDisplay,
  };
  const fromV2 = parseProject(JSON.stringify(version2));
  expect(fromV2).toEqual({ ...doc, guides: {}, annotations: {}, pieces: {} });
});

it("rejects unknown future schema versions without relabelling data", () => {
  const doc = addGuide(emptyDocument("future"), "y", 20, "h");
  expect(() => documentSchema.parse({ ...doc, schemaVersion: 6 })).toThrow();
});
