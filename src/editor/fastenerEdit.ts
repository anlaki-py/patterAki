import { fastenerSchema, type Fastener } from "../document/fastenerSchema";
import type { Annotation } from "../document/annotationSchema";

export type FastenerFields = {
  shape: "ellipse" | "rectangle";
  holes: "none" | "two" | "four";
  style: "straight" | "rounded" | "keyhole";
  width: number | string;
  height: number | string;
  length: number | string;
  eyeLength: number | string;
  eyeWidth: number | string;
  diameter: number | string;
  opening: number | string;
  holeDiameter: number | string;
  holeSpacing: number | string;
  stitches: number | string;
};
export function fastenerFields(mark: Fastener, factor: number): FastenerFields {
  return {
    shape: mark.kind === "button" ? mark.shape : "ellipse",
    holes: mark.kind === "button" ? mark.holes : "four",
    style: mark.kind === "buttonhole" ? mark.style : "straight",
    width: ("widthMm" in mark ? mark.widthMm : 2) / factor,
    height: (mark.kind === "button" ? mark.heightMm : 15) / factor,
    length: ("lengthMm" in mark ? mark.lengthMm : 20) / factor,
    eyeLength: (mark.kind === "buttonhole" ? mark.eyeLengthMm : 4) / factor,
    eyeWidth: (mark.kind === "buttonhole" ? mark.eyeWidthMm : 4) / factor,
    diameter: ("diameterMm" in mark ? mark.diameterMm : 12) / factor,
    opening: ("openingMm" in mark ? mark.openingMm : 4) / factor,
    holeDiameter: (mark.kind === "button" ? mark.holeDiameterMm : 1.5) / factor,
    holeSpacing: (mark.kind === "button" ? mark.holeSpacingMm : 4) / factor,
    stitches: mark.kind === "bartack" ? mark.stitches : 8,
  };
}
export function editedFastener(
  mark: Annotation & Fastener,
  fields: FastenerFields,
  factor: number,
): Annotation {
  const mm = (value: number | string, original: number) =>
    value === original / factor
      ? original
      : typeof value === "number"
        ? value * factor
        : NaN;
  let dimensions;
  switch (mark.kind) {
    case "button":
      dimensions = {
        shape: fields.shape,
        holes: fields.holes,
        widthMm: mm(fields.width, mark.widthMm),
        heightMm: mm(fields.height, mark.heightMm),
        holeDiameterMm: mm(fields.holeDiameter, mark.holeDiameterMm),
        holeSpacingMm: mm(fields.holeSpacing, mark.holeSpacingMm),
      };
      break;
    case "buttonhole":
      dimensions = {
        style: fields.style,
        lengthMm: mm(fields.length, mark.lengthMm),
        widthMm: mm(fields.width, mark.widthMm),
        eyeLengthMm: mm(fields.eyeLength, mark.eyeLengthMm),
        eyeWidthMm: mm(fields.eyeWidth, mark.eyeWidthMm),
      };
      break;
    case "eyelet":
    case "snap":
      dimensions = {
        diameterMm: mm(fields.diameter, mark.diameterMm),
        openingMm: mm(fields.opening, mark.openingMm),
      };
      break;
    case "bartack":
      dimensions = {
        lengthMm: mm(fields.length, mark.lengthMm),
        widthMm: mm(fields.width, mark.widthMm),
        stitches: typeof fields.stitches === "number" ? fields.stitches : NaN,
      };
      break;
  }
  const { id, position, rotation, ...specific } = mark;
  const result = fastenerSchema.safeParse({ ...specific, ...dimensions });
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(
      issue.code === "custom"
        ? issue.message
        : "Enter dimensions between 0.1 and 1000 mm, and 2–40 whole stitches.",
    );
  }
  return { ...result.data, id, position, rotation };
}
