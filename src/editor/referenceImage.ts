import { db } from "../persistence/database";
import {
  referenceDimensions,
  type ReferenceImage,
} from "../document/referenceSchema";
import { homography, project, validateCorners } from "../geometry/perspective";

export async function decodeImage(blob: Blob) {
  if (
    !["image/png", "image/jpeg"].includes(blob.type) ||
    blob.size > 20_000_000 ||
    !blob.size
  )
    throw new Error("Choose a PNG/JPEG file up to 20 MB.");
  const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  if (
    !(blob.type === "image/png"
      ? bytes.join(",") === "137,80,78,71,13,10,26,10"
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
  )
    throw new Error("Image contents do not match PNG/JPEG format.");
  const image = await createImageBitmap(blob);
  if (
    image.width > 8192 ||
    image.height > 8192 ||
    image.width * image.height > 16_000_000
  ) {
    image.close();
    throw new Error(
      "Image exceeds 8192 pixels per side or 16 million pixels. Resize it before importing.",
    );
  }
  return image;
}
export async function referenceCanvas(
  ref: Pick<
    ReferenceImage,
    "assetId" | "name" | "widthPx" | "heightPx" | "corners" | "perspectiveSize"
  >,
) {
  const asset = await db.assets.get(ref.assetId);
  if (!asset)
    throw new Error(
      `Missing reference asset: ${ref.name}. Restore its image backup.`,
    );
  const image = await decodeImage(asset.blob);
  try {
    if (image.width !== ref.widthPx || image.height !== ref.heightPx)
      throw new Error("Stored image dimensions do not match the reference.");
    const canvas = document.createElement("canvas");
    const size = referenceDimensions(ref);
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image canvas is unavailable.");
    context.drawImage(image, 0, 0);
    if (ref.corners) {
      validateCorners(ref.corners);
      const h = homography(ref.corners, [
        { x: 0, y: 0 },
        { x: canvas.width, y: 0 },
        { x: canvas.width, y: canvas.height },
        { x: 0, y: canvas.height },
      ]);
      const original = document.createElement("canvas");
      original.width = image.width;
      original.height = image.height;
      const originalContext = original.getContext("2d");
      if (!originalContext) throw new Error("Image canvas is unavailable.");
      originalContext.drawImage(image, 0, 0);
      const source = originalContext.getImageData(
          0,
          0,
          image.width,
          image.height,
        ),
        output = context.createImageData(canvas.width, canvas.height);
      for (let y = 0; y < canvas.height; y++)
        for (let x = 0; x < canvas.width; x++) {
          const p = project(h, { x, y }),
            sx = Math.round(p.x),
            sy = Math.round(p.y);
          if (sx < 0 || sy < 0 || sx >= image.width || sy >= image.height)
            continue;
          const from = (sy * image.width + sx) * 4,
            to = (y * canvas.width + x) * 4;
          output.data.set(source.data.subarray(from, from + 4), to);
        }
      context.putImageData(output, 0, 0);
    }
    return canvas;
  } finally {
    image.close();
  }
}
export const referenceTransform = (r: ReferenceImage) =>
  `translate(${r.x} ${r.y}) rotate(${r.rotation}) scale(${r.mmPerPixel})`;
