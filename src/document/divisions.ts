import { cubicParameterAtLength } from "../geometry/bezier";
import type { Anchor } from "../geometry/line";
import { asCubic, segmentLength } from "./segments";
import { splitLine } from "./operations";
import { documentSchema, type PatternDocument } from "./schema";

export type DivisionMode = "percent" | "equal" | "spacing";
export const maxDivisionSegments = 1000;
export const minimumDivisionMm = 0.001;

export function divisionDistances(
  total: number,
  mode: DivisionMode,
  value: number,
  origin: Anchor,
): number[] {
  if (
    !Number.isFinite(total) ||
    total <= minimumDivisionMm ||
    !Number.isFinite(value)
  )
    throw new Error("Enter a finite value on a nonzero edge.");
  let distances: number[];
  if (mode === "percent") {
    distances = [
      origin === "center"
        ? total * (0.5 + value / 100)
        : origin === "end"
          ? total * (1 - value / 100)
          : (total * value) / 100,
    ];
  } else if (mode === "equal") {
    if (!Number.isInteger(value) || value < 2 || value > maxDivisionSegments)
      throw new Error(
        `Choose a whole number of segments from 2 to ${maxDivisionSegments}.`,
      );
    distances = Array.from(
      { length: value - 1 },
      (_, i) => (total * (i + 1)) / value,
    );
  } else {
    if (value < minimumDivisionMm || value >= total)
      throw new Error(
        "Spacing must be at least 0.001 mm and smaller than the edge.",
      );
    if (
      Math.ceil(total / value) + (origin === "center" ? 1 : 0) >
      maxDivisionSegments
    )
      throw new Error(
        `Too many divisions. Use at most ${maxDivisionSegments} segments.`,
      );
    const count = Math.ceil(total / value);
    distances =
      origin === "center"
        ? [
            total / 2,
            ...Array.from(
              { length: Math.ceil(total / (2 * value)) - 1 },
              (_, i) => [
                total / 2 - (i + 1) * value,
                total / 2 + (i + 1) * value,
              ],
            ).flat(),
          ]
        : Array.from({ length: count - 1 }, (_, i) =>
            origin === "start" ? (i + 1) * value : total - (i + 1) * value,
          );
  }
  distances.sort((a, b) => a - b);
  const all = [0, ...distances, total];
  if (
    distances.length < 1 ||
    distances.length >= maxDivisionSegments ||
    all.some((d, i) => i > 0 && d - all[i - 1] < minimumDivisionMm - 1e-9)
  )
    throw new Error(
      "Each resulting segment must be at least 0.001 mm. Endpoints cannot be duplicated.",
    );
  return distances;
}

/** Split from B backwards so the original edge ID always addresses the remaining prefix. */
export function divideEdge(
  doc: PatternDocument,
  edgeId: string,
  distances: number[],
  id: () => string,
): PatternDocument {
  const edge = doc.segments[edgeId];
  if (!edge) throw new Error("Select an existing edge.");
  const total = segmentLength(doc, edge);
  const sorted = [...distances].sort((a, b) => a - b);
  const all = [0, ...sorted, total];
  if (
    !sorted.length ||
    sorted.length >= maxDivisionSegments ||
    all.some(
      (d, i) =>
        !Number.isFinite(d) ||
        (i > 0 && d - all[i - 1] < minimumDivisionMm - 1e-9),
    )
  )
    throw new Error("Invalid or over-dense split positions.");
  let next = doc;
  let previousT = 1;
  const curve = edge.kind === "cubic" ? asCubic(doc, edge) : null;
  for (const mm of sorted.reverse()) {
    const t = curve ? cubicParameterAtLength(curve, mm) : mm / total;
    next = splitLine(next, edgeId, t / previousT, id);
    previousT = t;
  }
  documentSchema.parse(next);
  return next;
}
