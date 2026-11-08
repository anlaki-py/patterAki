import { beforeEach, describe, expect, it } from "vitest";
import { addPath, changeLength, deleteSegments, splitLine } from "./operations";
import { documentSchema, emptyDocument, parseProject } from "./schema";
import { useEditor } from "../editor/store";
let counter = 0;
const id = () => String(++counter);
const line = () =>
  addPath(
    emptyDocument("test"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    false,
    id,
  );
beforeEach(() => {
  counter = 0;
});
describe("document operations", () => {
  it("inserts an exact 25 mm point and preserves total length", () => {
    const doc = line(),
      edge = Object.values(doc.segments)[0];
    const result = splitLine(doc, edge.id, 0.25, id);
    expect(result.points[result.segments[edge.id].to]).toEqual({ x: 25, y: 0 });
    expect(Object.keys(result.segments)).toHaveLength(2);
    expect(documentSchema.safeParse(result).success).toBe(true);
    expect(Object.keys(doc.points)).toHaveLength(2);
  });
  it("updates connected rectangle neighbours through shared vertices", () => {
    const doc = addPath(
      emptyDocument("test"),
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 80 },
        { x: 0, y: 80 },
      ],
      true,
      id,
    );
    const edge = Object.values(doc.segments)[0];
    const next = changeLength(doc, edge.id, 120, "center");
    expect(next.points[edge.from]).toEqual({ x: -10, y: 0 });
    expect(next.points[edge.to]).toEqual({ x: 110, y: 0 });
    expect(Object.keys(next.points)).toHaveLength(4);
  });
  it("round trips losslessly and rejects unsupported/corrupt projects", () => {
    const doc = line();
    expect(parseProject(JSON.stringify(doc))).toEqual(doc);
    expect(() => parseProject("{")).toThrow();
    expect(() =>
      parseProject(JSON.stringify({ ...doc, schemaVersion: 99 })),
    ).toThrow();
    expect(() => documentSchema.parse({ ...doc, points: {} })).toThrow();
  });
  it("removes orphaned points when deleting an edge", () => {
    const doc = line();
    expect(deleteSegments(doc, [Object.keys(doc.segments)[0]]).points).toEqual(
      {},
    );
  });
  it.each([0, 1, -1, NaN])("rejects invalid split %s", (t) => {
    const doc = line();
    expect(() => splitLine(doc, Object.keys(doc.segments)[0], t, id)).toThrow();
  });
});
describe("history transactions", () => {
  it("commits a drag once and restores exact state on undo/redo", () => {
    const doc = line();
    useEditor.getState().load(doc);
    const next = changeLength(doc, Object.keys(doc.segments)[0], 150, "end");
    useEditor.setState({ preview: next });
    expect(useEditor.getState().past).toHaveLength(0);
    useEditor.getState().commit(next);
    useEditor.getState().undo();
    expect(useEditor.getState().document).toEqual(doc);
    useEditor.getState().redo();
    expect(useEditor.getState().document).toEqual(next);
  });
  it("cancels previews without mutating the document or history", () => {
    const doc = line();
    useEditor.getState().load(doc);
    useEditor.setState({
      preview: changeLength(doc, Object.keys(doc.segments)[0], 200, "start"),
    });
    useEditor.getState().cancel();
    expect(useEditor.getState().preview).toBeNull();
    expect(useEditor.getState().document).toEqual(doc);
    expect(useEditor.getState().past).toHaveLength(0);
  });
  it("drops redo after a new edit", () => {
    useEditor.getState().load(line());
    useEditor
      .getState()
      .commit({ ...useEditor.getState().document, name: "first" });
    useEditor.getState().undo();
    useEditor
      .getState()
      .commit({ ...useEditor.getState().document, name: "second" });
    expect(useEditor.getState().future).toHaveLength(0);
  });
});
it("toolbar undo cancels a draft before touching committed history", () => {
  const doc = line();
  useEditor.getState().load(doc);
  useEditor.getState().commit({ ...doc, name: "renamed" });
  useEditor.setState({ hasDraft: true });
  useEditor.getState().undo();
  expect(useEditor.getState().hasDraft).toBe(false);
  expect(useEditor.getState().document.name).toBe("renamed");
  expect(useEditor.getState().past).toHaveLength(1);
});
