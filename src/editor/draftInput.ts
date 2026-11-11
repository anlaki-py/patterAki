import { parseLength } from "../document/lengthInput";
import { endpoint, type Vec2 } from "../geometry/line";

export function exactDraftEndpoint(
  origin: Vec2,
  length: string | number,
  degrees: string | number,
  factor: number,
) {
  if (String(degrees).trim() === "") throw new Error("Enter an angle.");
  return endpoint(origin, parseLength(length, factor), Number(degrees));
}
export function rectangleDimensions(
  width: string | number,
  height: string | number,
  factor: number,
) {
  const w = parseLength(width, factor),
    h = parseLength(height, factor);
  if (w <= 0 || h <= 0) throw new Error("Width and height must be positive.");
  return { width: w, height: h };
}
