import { expect, it } from "vitest";
import { addPath } from "./operations";
import { emptyDocument, parseProject } from "./schema";
import { bendCurve, moveHandle, setPointMode, moveVertex } from "./curves";
import { useEditor } from "../editor/store";

function fixture() {
  let id = 0;
  const positions = [
    { x: 0, y: 0 },
    { x: 60, y: 0 },
    { x: 120, y: 0 },
  ];
  const doc = addPath(emptyDocument("m13"), positions, false, () =>
    String(++id),
  );
  const edges = Object.values(doc.segments);
  return { doc, edges, shared: edges[0].to };
}
it("smooth preserves opposite arm length; symmetric matches length; Alt decouples", () => {
  const { doc, edges, shared } = fixture();
  for (const mode of ["smooth", "symmetric"] as const) {
    const linked = setPointMode(doc, shared, mode);
    const moved = moveHandle(linked, edges[0].id, "control2", { x: 60, y: 30 });
    const other = moved.segments[edges[1].id];
    expect(other.kind).toBe("cubic");
    if (other.kind !== "cubic") throw Error("Missing cubic");
    expect(other.control1.x).toBeCloseTo(60);
    expect(other.control1.y).toBeCloseTo(mode === "smooth" ? -20 : -30);
    const independent = moveHandle(
      linked,
      edges[0].id,
      "control2",
      { x: 60, y: 30 },
      true,
    );
    expect(independent.segments[edges[1].id]).toEqual(
      linked.segments[edges[1].id],
    );
    expect(parseProject(JSON.stringify(moved))).toEqual(moved);
    expect(moveVertex(moved, shared, { x: 61, y: 1 }).points[shared].mode).toBe(
      mode,
    );
  }
});
it("corner leaves neighbours independent and rejects linked branch points", () => {
  const { doc, edges, shared } = fixture();
  const corner = setPointMode(doc, shared, "corner");
  expect(
    moveHandle(corner, edges[0].id, "control2", { x: 50, y: 10 }).segments[
      edges[1].id
    ],
  ).toEqual(doc.segments[edges[1].id]);
  const branched = {
    ...doc,
    segments: { ...doc.segments, branch: { ...edges[1], id: "branch" } },
  };
  expect(() => setPointMode(branched, shared, "smooth")).toThrow("at most two");
});
it("explicit curve bending preserves neighboring straight segments and commits one history entry", () => {
  const { doc, edges } = fixture();
  const next = bendCurve(doc, edges[0].id, 0.5, { x: 0, y: 20 });
  expect(next.segments[edges[0].id].kind).toBe("cubic");
  expect(next.segments[edges[1].id]).toEqual(doc.segments[edges[1].id]);
  expect(next.points).toEqual(doc.points);
  useEditor.getState().load(doc);
  useEditor.setState({ preview: next });
  useEditor.getState().cancel();
  expect(useEditor.getState().document).toEqual(doc);
  useEditor.getState().commit(next);
  useEditor.getState().undo();
  expect(useEditor.getState().document).toEqual(doc);
  useEditor.getState().redo();
  expect(useEditor.getState().document).toEqual(next);
});
it("migrates v5 without changing geometry and rejects invalid modes", () => {
  const { doc } = fixture();
  expect(parseProject(JSON.stringify({ ...doc, schemaVersion: 5 }))).toEqual(
    doc,
  );
  const id = Object.keys(doc.points)[0];
  expect(() =>
    parseProject(
      JSON.stringify({
        ...doc,
        points: { ...doc.points, [id]: { ...doc.points[id], mode: "unknown" } },
      }),
    ),
  ).toThrow();
});
