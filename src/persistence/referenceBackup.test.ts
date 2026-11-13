import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, expect, it, vi } from "vitest";
import { db, ProjectDatabase } from "./database";
import { importBackup, projectBackup } from "./referenceBackup";
import { emptyDocument } from "../document/schema";
import { decodeImage } from "../editor/referenceImage";
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const reference = {
  id: "reference",
  assetId: "original",
  name: "scan.png",
  widthPx: 192,
  heightPx: 192,
  x: 0,
  y: 0,
  rotation: 0,
  mmPerPixel: 0.5,
  opacity: 0.4,
  locked: true,
  visible: true,
};
const document = { ...emptyDocument("images"), references: { reference } };
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await db.assets.clear();
});
it("backs up original blobs once, remaps imported assets and preserves geometry and calibration", async () => {
  const close = vi.fn();
  vi.stubGlobal("createImageBitmap", async () => ({
    width: 192,
    height: 192,
    close,
  }));
  await db.assets.put({
    id: "original",
    blob: new Blob([png], { type: "image/png" }),
    mime: "image/png",
  });
  const backup = await projectBackup(document);
  expect(JSON.stringify(backup)).toContain("base64");
  expect(JSON.stringify(document)).not.toContain("base64");
  const imported = await importBackup(JSON.stringify(backup));
  const ref = imported.references!.reference;
  expect(ref).toEqual({ ...reference, assetId: ref.assetId });
  expect(ref.assetId).not.toBe("original");
  expect(
    new Uint8Array(
      await (await db.assets.get(ref.assetId))!.blob.arrayBuffer(),
    ),
  ).toEqual(png);
  expect(close).toHaveBeenCalled();
});
it("rejects missing/corrupt backup images and unsupported bundle versions before storing assets", async () => {
  await expect(projectBackup(document)).rejects.toThrow("missing");
  await expect(importBackup(JSON.stringify(document))).rejects.toThrow(
    "missing",
  );
  for (const bundle of [
    { format: "patternaki-reference-backup", version: 2, document, assets: [] },
    { format: "patternaki-reference-backup", version: 1, document, assets: [] },
    {
      format: "patternaki-reference-backup",
      version: 1,
      document,
      assets: [{ id: "original", mime: "image/png", base64: btoa("bad") }],
    },
  ])
    await expect(importBackup(JSON.stringify(bundle))).rejects.toThrow();
  expect(await db.assets.count()).toBe(0);
});
it("image validation rejects non-image types, empty, oversized and huge decoded images", async () => {
  await expect(
    decodeImage(new Blob([png], { type: "image/svg+xml" })),
  ).rejects.toThrow("PNG/JPEG");
  await expect(
    decodeImage(new Blob([], { type: "image/png" })),
  ).rejects.toThrow();
  await expect(
    decodeImage(new Blob([new Uint8Array(20_000_001)], { type: "image/png" })),
  ).rejects.toThrow();
  const close = vi.fn();
  vi.stubGlobal("createImageBitmap", async () => ({
    width: 8192,
    height: 8192,
    close,
  }));
  await expect(
    decodeImage(new Blob([png], { type: "image/png" })),
  ).rejects.toThrow("16 million");
  expect(close).toHaveBeenCalled();
});
it("upgrades database v3 to v4 with separate assets while preserving the stored project body", async () => {
  const name = `reference-upgrade-${crypto.randomUUID()}`,
    old = new Dexie(name);
  old.version(3).stores({
    projects: "id,updatedAt",
    settings: "id",
    preferences: "id",
    projectSettings: "id",
    checkpoints: "id,projectId,savedAt",
  });
  const original = { ...emptyDocument("old"), schemaVersion: 9 };
  await old
    .table("projects")
    .put({ id: "old", document: original, updatedAt: 1, revision: 1 });
  old.close();
  const upgraded = new ProjectDatabase(name);
  try {
    await upgraded.open();
    expect(upgraded.verno).toBe(4);
    expect(await upgraded.assets.count()).toBe(0);
    expect((await upgraded.projects.get("old"))!.document).toEqual(original);
  } finally {
    await upgraded.delete();
  }
});
it("refuses oversized backups before allocating image buffers", async () => {
  const blob = new Blob([png], { type: "image/png" });
  Object.defineProperty(blob, "size", { value: 80_000_000 });
  vi.spyOn(db.assets, "get").mockResolvedValue({
    id: "original",
    blob,
    mime: "image/png",
  });
  const read = vi.spyOn(blob, "arrayBuffer");
  await expect(projectBackup(document)).rejects.toThrow("100 MB");
  expect(read).not.toHaveBeenCalled();
});
it("shared references keep one portable original and one remapped asset", async () => {
  const close = vi.fn();
  vi.stubGlobal("createImageBitmap", async () => ({
    width: 192,
    height: 192,
    close,
  }));
  await db.assets.put({
    id: "original",
    blob: new Blob([png], { type: "image/png" }),
    mime: "image/png",
  });
  const shared = {
    ...document,
    references: { reference, second: { ...reference, id: "second", x: 100 } },
  };
  const backup = await projectBackup(shared);
  const imported = await importBackup(JSON.stringify(backup));
  expect(imported.references!.reference.assetId).toBe(
    imported.references!.second.assetId,
  );
  expect(await db.assets.count()).toBe(2);
  expect(close).toHaveBeenCalledTimes(1);
});
