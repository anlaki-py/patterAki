import { useEffect, useState } from "react";
import type { ReferenceImage } from "../document/referenceSchema";
import { referenceCanvas } from "./referenceImage";

export function useReferenceRaster(
  ref: ReferenceImage | null,
  original = false,
) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const assetId = ref?.assetId,
    name = ref?.name,
    widthPx = ref?.widthPx,
    heightPx = ref?.heightPx;
  const cornerKey = original
    ? ""
    : (ref?.corners?.map((p) => `${p.x},${p.y}`).join(";") ?? "");
  const paperWidth = original ? undefined : ref?.perspectiveSize?.widthMm;
  const paperHeight = original ? undefined : ref?.perspectiveSize?.heightMm;
  useEffect(() => {
    let live = true;
    setUrl("");
    setError("");
    const corners = cornerKey
      ? cornerKey.split(";").map((pair) => {
          const [x, y] = pair.split(",").map(Number);
          return { x, y };
        })
      : undefined;
    const perspectiveSize =
      paperWidth && paperHeight
        ? { widthMm: paperWidth, heightMm: paperHeight }
        : undefined;
    if (assetId && name && widthPx && heightPx)
      void referenceCanvas({
        assetId,
        name,
        widthPx,
        heightPx,
        corners,
        perspectiveSize,
      })
        .then((canvas) => {
          if (live) setUrl(canvas.toDataURL("image/png"));
        })
        .catch((cause) => {
          if (live) setError((cause as Error).message);
        });
    return () => {
      live = false;
    };
  }, [assetId, name, widthPx, heightPx, cornerKey, paperWidth, paperHeight]);
  return { url, error };
}
