import { beforeEach, expect, it } from "vitest";
import {
  documentSchema,
  emptyDocument,
  type PatternDocument,
} from "../document/schema";
import { defaultHistoryBudget, estimatedSnapshotBytes } from "./historyBudget";
import { useEditor } from "./store";

function drawing(count: number) {
  const doc = emptyDocument("history-drawing");
  for (let i = 0; i <= count; i++) doc.points[`p${i}`] = { x: i, y: i % 2 };
  for (let i = 0; i < count; i++)
    doc.segments[`s${i}`] = {
      id: `s${i}`,
      kind: "line",
      from: `p${i}`,
      to: `p${i + 1}`,
    };
  return documentSchema.parse(doc);
}
const bytes = (docs: PatternDocument[]) =>
  docs.reduce((sum, doc) => sum + estimatedSnapshotBytes(doc), 0);
beforeEach(() => useEditor.getState().load(emptyDocument("history")));

it("trims large real history before 100 edits, preserves current geometry and traverses retained states exactly", () => {
  const original = drawing(4000);
  useEditor.getState().load(original);
  for (let i = 1; i <= 30; i++) {
    const s = useEditor.getState();
    s.commit({ ...s.document, name: `Edit ${i}` });
  }
  const after = useEditor.getState();
  expect(after.past.length).toBeGreaterThan(0);
  expect(after.past.length).toBeLessThan(30);
  expect(bytes(after.past)).toBeLessThanOrEqual(
    defaultHistoryBudget.maxEstimatedBytes,
  );
  expect(after.document.points).toEqual(original.points);
  expect(after.document.segments).toEqual(original.segments);
  expect(after.document.name).toBe("Edit 30");
  expect(after.saveStatus).toBe("Unsaved");
  const retained = [...after.past, after.document];
  for (let i = retained.length - 2; i >= 0; i--) {
    useEditor.getState().undo();
    expect(useEditor.getState().document).toBe(retained[i]);
    const s = useEditor.getState();
    expect(bytes([...s.past, ...s.future])).toBeLessThanOrEqual(
      defaultHistoryBudget.maxEstimatedBytes,
    );
  }
  const oldest = useEditor.getState().document;
  useEditor.getState().undo();
  expect(useEditor.getState().document).toBe(oldest);
  for (const doc of retained.slice(1)) {
    useEditor.getState().redo();
    expect(useEditor.getState().document).toBe(doc);
  }
  expect(useEditor.getState().revision).toBeGreaterThan(after.revision);
}, 20000);

it("keeps redo and history intact when an edit fails validation or changes nothing", () => {
  const doc = drawing(2);
  useEditor.getState().load(doc);
  useEditor.getState().commit({ ...doc, name: "Renamed" });
  useEditor.getState().undo();
  const before = useEditor.getState();
  expect(() => before.commit({ ...before.document, name: "" })).toThrow();
  before.commit({ ...before.document });
  const after = useEditor.getState();
  expect(after.past).toBe(before.past);
  expect(after.future).toBe(before.future);
  expect(after.document).toBe(before.document);
  expect(after.revision).toBe(before.revision);
  after.redo();
  expect(useEditor.getState().document.name).toBe("Renamed");
});

it("clears redo on a new branch and clears all retained snapshots on project load", () => {
  const doc = drawing(2);
  useEditor.getState().load(doc);
  for (const name of ["One", "Two", "Three"]) {
    const s = useEditor.getState();
    s.commit({ ...s.document, name });
  }
  useEditor.getState().undo();
  const s = useEditor.getState();
  s.commit({ ...s.document, name: "Branch" });
  expect(useEditor.getState().future).toHaveLength(0);
  useEditor.getState().redo();
  expect(useEditor.getState().document.name).toBe("Branch");
  useEditor.getState().load(emptyDocument("another"));
  expect(useEditor.getState().past).toHaveLength(0);
  expect(useEditor.getState().future).toHaveLength(0);
});

it("preserves an oversized immediate undo/redo state without refusing edits", () => {
  const small = drawing(1);
  const huge = drawing(80000);
  expect(estimatedSnapshotBytes(huge)).toBeGreaterThan(
    defaultHistoryBudget.maxEstimatedBytes,
  );
  useEditor.getState().load(small);
  useEditor.getState().commit({ ...small, name: "Before large edit" });
  const previous = useEditor.getState().document;
  useEditor.getState().commit(huge);
  const current = useEditor.getState().document;
  useEditor.getState().undo();
  expect(useEditor.getState().document).toBe(previous);
  expect(useEditor.getState().past).toHaveLength(0);
  expect(useEditor.getState().future).toEqual([current]);
  useEditor.getState().redo();
  expect(useEditor.getState().document).toBe(current);
  useEditor.getState().commit({ ...small, name: "Small again" });
  expect(useEditor.getState().past).toEqual([current]);
  expect(useEditor.getState().document.name).toBe("Small again");
  useEditor.getState().undo();
  expect(useEditor.getState().document).toBe(current);
  useEditor.getState().redo();
  expect(useEditor.getState().document.name).toBe("Small again");
}, 20000);
