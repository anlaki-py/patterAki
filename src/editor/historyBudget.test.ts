import { expect, it } from "vitest";
import { emptyDocument } from "../document/schema";
import { addPath } from "../document/operations";
import { newAnnotation } from "../document/annotations";
import {
  boundedHistory,
  defaultHistoryBudget,
  estimatedSnapshotBytes,
} from "./historyBudget";

const states = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    ...emptyDocument("history"),
    name: `State ${i}`,
  }));
const total = (docs: ReturnType<typeof states>) =>
  docs.reduce((sum, doc) => sum + estimatedSnapshotBytes(doc), 0);

it("counts geometry, labels and reference metadata without mutating documents", () => {
  const empty = emptyDocument("sizes");
  let i = 0;
  const line = addPath(
    empty,
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    false,
    () => `item-${++i}`,
  );
  const label = {
    ...line,
    annotations: { note: newAnnotation("text", { x: 0, y: 0 }, "note") },
  };
  const reference = {
    ...label,
    references: {
      ref: {
        id: "ref",
        assetId: "stored-image",
        name: "Image",
        widthPx: 100,
        heightPx: 100,
        x: 0,
        y: 0,
        mmPerPixel: 1,
        rotation: 0,
        opacity: 0.3,
        locked: true,
        visible: true,
      },
    },
  };
  const before = JSON.stringify(reference);
  expect(estimatedSnapshotBytes(line)).toBeGreaterThan(
    estimatedSnapshotBytes(empty),
  );
  expect(estimatedSnapshotBytes(label)).toBeGreaterThan(
    estimatedSnapshotBytes(line),
  );
  expect(estimatedSnapshotBytes(reference)).toBeGreaterThan(
    estimatedSnapshotBytes(label),
  );
  const longer = {
    ...label,
    annotations: {
      note: { ...label.annotations.note, text: "a".repeat(1000) },
    },
  };
  expect(estimatedSnapshotBytes(longer)).toBeGreaterThan(
    estimatedSnapshotBytes(label),
  );
  expect(JSON.stringify(reference)).toBe(before);
});

it("keeps small histories intact at the exact estimated-byte boundary", () => {
  const docs = states(3);
  const budget = { maxSteps: 100, maxEstimatedBytes: total(docs) };
  expect(boundedHistory(docs, [], "past", budget).past).toEqual(docs);
  expect(
    boundedHistory(docs, [], "past", {
      ...budget,
      maxEstimatedBytes: budget.maxEstimatedBytes - 1,
    }).past,
  ).toEqual(docs.slice(1));
});

it("trims the oldest undo states and farthest redo states to one shared step limit", () => {
  const docs = states(10);
  const past = docs.slice(0, 5);
  const future = docs.slice(5);
  const originalPast = [...past];
  const originalFuture = [...future];
  const result = boundedHistory(past, future, "past", {
    maxSteps: 4,
    maxEstimatedBytes: Number.MAX_SAFE_INTEGER,
  });
  expect(result.past).toEqual(docs.slice(3, 5));
  expect(result.future).toEqual(docs.slice(5, 7));
  expect(past).toEqual(originalPast);
  expect(future).toEqual(originalFuture);
});

it("budgets undo and redo together even when each stack fits alone", () => {
  const docs = states(6);
  const past = docs.slice(0, 3);
  const future = docs.slice(3);
  const budget = { maxSteps: 100, maxEstimatedBytes: total(past) };
  expect(total(future)).toBe(budget.maxEstimatedBytes);
  const result = boundedHistory(past, future, "past", budget);
  expect(result.past).toEqual(docs.slice(1, 3));
  expect(result.future).toEqual(docs.slice(3, 4));
  expect(total([...result.past, ...result.future])).toBeLessThanOrEqual(
    budget.maxEstimatedBytes,
  );
});

it.each(["past", "future"] as const)(
  "preserves the nearest %s inverse when one snapshot exceeds the budget",
  (preferred) => {
    const docs = states(4);
    const result = boundedHistory(docs.slice(0, 2), docs.slice(2), preferred, {
      maxSteps: 100,
      maxEstimatedBytes: 1,
    });
    expect(result.past).toEqual(preferred === "past" ? [docs[1]] : []);
    expect(result.future).toEqual(preferred === "future" ? [docs[2]] : []);
  },
);

it("retains at most 100 steps under the default policy", () => {
  const docs = states(130);
  const result = boundedHistory(docs, [], "past");
  expect(result.past).toEqual(docs.slice(-defaultHistoryBudget.maxSteps));
});

it("handles empty history without adding snapshots", () => {
  expect(boundedHistory([], [], "past")).toEqual({ past: [], future: [] });
});
