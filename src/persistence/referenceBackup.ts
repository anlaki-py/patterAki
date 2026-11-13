import { z } from "zod";
import {
  documentSchema,
  parseProject,
  type PatternDocument,
} from "../document/schema";
import { db } from "./database";
import { decodeImage } from "../editor/referenceImage";
import { createId } from "../editor/ids";
const bundleSchema = z
  .object({
    format: z.literal("patternaki-reference-backup"),
    version: z.literal(1),
    document: z.unknown(),
    assets: z
      .array(
        z
          .object({
            id: z.string().min(1),
            mime: z.enum(["image/png", "image/jpeg"]),
            base64: z.string().max(27_000_000),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
function base64(bytes: Uint8Array) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 32768)
    text += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(text);
}
export async function projectBackup(doc: PatternDocument) {
  const refs = Object.values(doc.references ?? {});
  if (!refs.length) return doc;
  const ids = [...new Set(refs.map((r) => r.assetId))];
  const originals = await Promise.all(
    ids.map(async (id) => {
      const asset = await db.assets.get(id);
      if (!asset)
        throw new Error(
          "A reference image is missing. Download geometry JSON and restore the image from its original file.",
        );
      return asset;
    }),
  );
  const overhead = JSON.stringify({
    format: "patternaki-reference-backup",
    version: 1,
    document: doc,
    assets: originals.map((asset) => ({
      id: asset.id,
      mime: asset.mime,
      base64: "",
    })),
  }).length;
  if (
    overhead +
      originals.reduce(
        (size, asset) => size + 4 * Math.ceil(asset.blob.size / 3),
        0,
      ) >
    100_000_000
  )
    throw new Error(
      "Image backup exceeds 100 MB. Download originals separately and use geometry JSON.",
    );
  const assets: { id: string; mime: string; base64: string }[] = [];
  for (const asset of originals)
    assets.push({
      id: asset.id,
      mime: asset.mime,
      base64: base64(new Uint8Array(await asset.blob.arrayBuffer())),
    });
  const bundle = {
    format: "patternaki-reference-backup",
    version: 1,
    document: doc,
    assets,
  };
  return bundle;
}
export async function importBackup(text: string): Promise<PatternDocument> {
  if (text.length > 100_000_000)
    throw new Error("Backup exceeds the 100 MB limit.");
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || !("format" in value)) {
    const doc = parseProject(text);
    for (const r of Object.values(doc.references ?? {}))
      if (!(await db.assets.get(r.assetId)))
        throw new Error(
          "Reference image missing from this geometry-only file. Import a complete image backup.",
        );
    return doc;
  }
  const bundle = bundleSchema.parse(value),
    doc = documentSchema.parse(bundle.document);
  const assets = new Map(bundle.assets.map((a) => [a.id, a]));
  if (assets.size !== bundle.assets.length)
    throw new Error("Duplicate backup image identity.");
  const records: { id: string; blob: Blob; mime: string }[] = [];
  const remap = new Map<string, string>();
  const sizes = new Map<string, { width: number; height: number }>();
  for (const ref of Object.values(doc.references ?? {})) {
    const asset = assets.get(ref.assetId);
    if (!asset)
      throw new Error("Backup is missing an original reference image.");
    const previous = sizes.get(asset.id);
    if (previous) {
      if (previous.width !== ref.widthPx || previous.height !== ref.heightPx)
        throw new Error("Shared image dimensions do not match the reference.");
      continue;
    }
    const blob = new Blob(
      [Uint8Array.from(atob(asset.base64), (c) => c.charCodeAt(0))],
      { type: asset.mime },
    );
    const image = await decodeImage(blob);
    const matches =
      image.width === ref.widthPx && image.height === ref.heightPx;
    sizes.set(asset.id, { width: image.width, height: image.height });
    image.close();
    if (!matches)
      throw new Error("Backup image dimensions do not match the reference.");
    const id = createId();
    remap.set(asset.id, id);
    records.push({ id, blob, mime: asset.mime });
  }
  await db.transaction("rw", db.assets, () => db.assets.bulkAdd(records));
  return {
    ...doc,
    references: Object.fromEntries(
      Object.entries(doc.references ?? {}).map(([id, r]) => [
        id,
        { ...r, assetId: remap.get(r.assetId)! },
      ]),
    ),
  };
}
