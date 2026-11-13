import { expect, it } from "vitest";
import { documentSchema, emptyDocument } from "./schema";
import { referenceSchema } from "./referenceSchema";
import { useEditor } from "../editor/store";
const reference = {
  id: "ref",
  assetId: "asset",
  name: "scan.png",
  widthPx: 400,
  heightPx: 300,
  x: 0,
  y: 0,
  mmPerPixel: 0.25,
  rotation: 0,
  opacity: 0.4,
  locked: true,
  visible: true,
};
it("explicitly migrates v9 without changing canonical geometry and rejects unknown schemas", () => {
  const old = { ...emptyDocument("old"), schemaVersion: 9 };
  const migrated = documentSchema.parse(old);
  expect(migrated).toEqual({ ...old, schemaVersion: 10 });
  expect(old.schemaVersion).toBe(9);
  expect(() => documentSchema.parse({ ...old, schemaVersion: 11 })).toThrow();
  expect(() =>
    documentSchema.parse({ ...old, references: { ref: reference } }),
  ).toThrow();
});
it("references commit once, undo/redo and JSON round-trip without image bytes", () => {
  const doc = emptyDocument("refs");
  useEditor.getState().load(doc);
  useEditor.getState().commit({ ...doc, references: { ref: reference } });
  expect(useEditor.getState().past).toHaveLength(1);
  expect(JSON.stringify(useEditor.getState().document)).not.toContain("base64");
  const roundTrip = documentSchema.parse(
    JSON.parse(JSON.stringify(useEditor.getState().document)),
  );
  expect(roundTrip.references?.ref.assetId).toBe("asset");
  useEditor.getState().undo();
  expect(useEditor.getState().document.references).toBeUndefined();
  useEditor.getState().redo();
  expect(useEditor.getState().document.references?.ref).toEqual(reference);
});
it("rejects invalid dimensions, opacity, corners and reference identities without losing geometry", () => {
  const doc = emptyDocument("preserved");
  useEditor.getState().load(doc);
  for (const fields of [
    { opacity: 2 },
    { mmPerPixel: 0 },
    { widthPx: 9000 },
    { rotation: Infinity },
    { corners: Array(4).fill({ x: 0, y: 0 }) },
  ])
    expect(referenceSchema.safeParse({ ...reference, ...fields }).success).toBe(
      false,
    );
  expect(() =>
    useEditor.getState().commit({ ...doc, references: { other: reference } }),
  ).toThrow();
  expect(useEditor.getState().document).toEqual(doc);
  expect(useEditor.getState().past).toHaveLength(0);
});
it("validates calibration consistency and physical perspective aspect without changing originals", () => {
  const corners = [
    { x: 10, y: 10 },
    { x: 390, y: 20 },
    { x: 380, y: 290 },
    { x: 20, y: 280 },
  ];
  expect(
    referenceSchema.safeParse({
      ...reference,
      corners,
      perspectiveSize: { widthMm: 100, heightMm: 200 },
    }).success,
  ).toBe(true);
  expect(
    referenceSchema.safeParse({
      ...reference,
      calibration: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, distanceMm: 100 },
    }).success,
  ).toBe(false);
  expect(
    referenceSchema.safeParse({
      ...reference,
      corners,
      perspectiveSize: { widthMm: 1, heightMm: 1e7 },
    }).success,
  ).toBe(false);
});
