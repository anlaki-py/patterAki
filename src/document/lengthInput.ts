import { unitFactor } from "./schema";

/** A bare value uses the current display unit; an explicit suffix overrides it. */
export function parseLength(value: string | number, factor: number): number {
  const match = String(value)
    .trim()
    .match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(mm|cm|in)?$/i);
  if (!match)
    throw new Error("Enter a number, optionally followed by mm, cm or in.");
  const unit = match[2]?.toLowerCase() as keyof typeof unitFactor | undefined;
  const mm = Number(match[1]) * (unit ? unitFactor[unit] : factor);
  if (!Number.isFinite(mm)) throw new Error("Enter a finite length.");
  return mm;
}
