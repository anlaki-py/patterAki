import type { PatternDocument } from "../document/schema";

type HistoryBudget = { maxSteps: number; maxEstimatedBytes: number };
export const defaultHistoryBudget: Readonly<HistoryBudget> = Object.freeze({
  maxSteps: 100,
  maxEstimatedBytes: 32 * 1024 * 1024,
});
const sizes = new WeakMap<PatternDocument, number>();

/** Approximate retained data, including topology and labels, without storing JSON.
 * Object overhead varies by JS engine. Shared data across snapshots is charged
 * to each snapshot, so this deliberately does not depend on structural sharing.
 */
export function estimatedSnapshotBytes(doc: PatternDocument): number {
  const cached = sizes.get(doc);
  if (cached !== undefined) return cached;
  let bytes = 0;
  const pending: unknown[] = [doc];
  const seen = new WeakSet<object>();
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === "string") bytes += 16 + value.length * 2;
    else if (typeof value === "number") bytes += 8;
    else if (typeof value === "boolean") bytes += 4;
    else if (value && typeof value === "object" && !seen.has(value)) {
      seen.add(value);
      if (Array.isArray(value)) {
        bytes += 32 + value.length * 8;
        for (const item of value) pending.push(item);
      } else {
        bytes += 64;
        for (const [key, item] of Object.entries(value)) {
          bytes += 24 + key.length * 2;
          pending.push(item);
        }
      }
    }
  }
  sizes.set(doc, bytes);
  return bytes;
}

/** Keep contiguous states nearest the current document on both sides of history. */
export function boundedHistory(
  past: readonly PatternDocument[],
  future: readonly PatternDocument[],
  preferred: "past" | "future",
  budget: Readonly<HistoryBudget> = defaultHistoryBudget,
) {
  let start = 0;
  let end = future.length;
  let bytes = 0;
  for (const doc of past) bytes += estimatedSnapshotBytes(doc);
  for (const doc of future) bytes += estimatedSnapshotBytes(doc);
  let pastCount = past.length;
  let futureCount = future.length;
  // Retain the immediate inverse even when a single large snapshot exceeds the
  // budget. The current document is never trimmed or refused to fit history.
  while (
    pastCount + futureCount > 1 &&
    (pastCount + futureCount > budget.maxSteps ||
      bytes > budget.maxEstimatedBytes)
  ) {
    if (
      pastCount > futureCount ||
      (pastCount === futureCount && preferred === "future")
    ) {
      bytes -= estimatedSnapshotBytes(past[start++]);
      pastCount--;
    } else {
      bytes -= estimatedSnapshotBytes(future[--end]);
      futureCount--;
    }
  }
  return { past: past.slice(start), future: future.slice(0, end) };
}
