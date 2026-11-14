import { memo } from "react";
import {
  referenceDimensions,
  type ReferenceImage,
} from "../document/referenceSchema";
import type { PatternDocument } from "../document/schema";
import { referenceTransform } from "./referenceImage";
import { useReferenceRaster } from "./useReferenceRaster";
function ReferenceRaster({ reference: r }: { reference: ReferenceImage }) {
  const { url, error } = useReferenceRaster(r);
  const size = referenceDimensions(r);
  return (
    <>
      {url && (
        <image
          href={url}
          width={size.width}
          height={size.height}
          opacity={r.opacity}
          transform={referenceTransform(r)}
        />
      )}{" "}
      {error && (
        <text x={r.x} y={r.y} fill="red" fontSize="4">
          {error}
        </text>
      )}
    </>
  );
}
export const ReferenceLayer = memo(function ReferenceLayer({
  doc,
}: {
  doc: PatternDocument;
}) {
  return (
    <g pointerEvents="none" data-layer="references">
      {Object.values(doc.references ?? {})
        .filter((r) => r.visible)
        .map((r) => (
          <ReferenceRaster key={r.id} reference={r} />
        ))}
    </g>
  );
});
