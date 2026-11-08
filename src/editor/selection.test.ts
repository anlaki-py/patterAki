import { beforeEach, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { addPath } from "../document/operations";
import { bendCurve } from "../document/curves";
import { emptyDocument } from "../document/schema";
import { beginSelectionDrag } from "./selectionDrag";
import { clickSelection, contextSelection } from "./selection";
import { executeEdgeActions } from "./edgeActions";
import { deleteSelection } from "./selectionActions";
import { editCommands } from "./commands";
import { SvgGeometry } from "./SvgGeometry";
import { useEditor } from "./store";
let counter = 0;
const id = () => String(++counter);
function fixture() {
  return addPath(
    emptyDocument("selection"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ],
    false,
    id,
  );
}
beforeEach(() => {
  counter = 0;
  useEditor.getState().load(fixture());
  useEditor.setState({ tool: "select" });
});
function gesture(
  edgeId?: string,
  additive = false,
  scale = 2,
  point = { x: 50, y: 0 },
) {
  return beginSelectionDrag({
    itemId: edgeId,
    point,
    additive,
    scale,
    pointer: 1,
  });
}
it("adds/removes with Shift, retains the group on a selected edge, and replaces on a new edge", () => {
  expect(clickSelection(["a"], "b", true)).toEqual(["a", "b"]);
  expect(clickSelection(["a", "b"], "a", true)).toEqual(["b"]);
  expect(clickSelection(["a", "b"], "b", false)).toEqual(["a", "b"]);
  expect(clickSelection(["a", "b"], "c", false)).toEqual(["c"]);
  expect(contextSelection(["a", "b"], "b")).toEqual(["a", "b"]);
  expect(contextSelection(["a", "b"], "c")).toEqual(["c"]);
});
it("selects and drags an initially unselected edge in one gesture", () => {
  const doc = useEditor.getState().document;
  const edge = Object.values(doc.segments)[0];
  const drag = gesture(edge.id);
  expect(useEditor.getState().selected).toEqual([edge.id]);
  drag.move({ x: 60, y: 20 }, 1);
  expect(useEditor.getState().document).toEqual(doc);
  expect(useEditor.getState().past).toHaveLength(0);
  expect(useEditor.getState().preview?.points[edge.from]).toEqual({
    x: 10,
    y: 20,
  });
  drag.finish({ x: 65, y: 25 }, 1);
  expect(useEditor.getState().document.points[edge.from]).toEqual({
    x: 15,
    y: 25,
  });
  expect(useEditor.getState().past).toHaveLength(1);
  const moved = useEditor.getState().document;
  useEditor.getState().undo();
  expect(useEditor.getState().document).toEqual(doc);
  useEditor.getState().redo();
  expect(useEditor.getState().document).toEqual(moved);
});
it("Shift-selects a group, then moves shared endpoints only once", () => {
  const doc = useEditor.getState().document;
  const edges = Object.values(doc.segments);
  gesture(edges[0].id).finish({ x: 50, y: 0 }, 1);
  gesture(edges[1].id, true).finish({ x: 50, y: 0 }, 1);
  expect(useEditor.getState().selected).toEqual(edges.map((e) => e.id));
  const drag = gesture(edges[0].id);
  drag.move({ x: 60, y: 20 }, 1);
  drag.move({ x: 70, y: 30 }, 1);
  drag.finish({ x: 70, y: 30 }, 1);
  for (const [id, p] of Object.entries(doc.points))
    expect(useEditor.getState().document.points[id]).toEqual({
      x: p.x + 20,
      y: p.y + 30,
    });
  expect(useEditor.getState().past).toHaveLength(1);
});
it.each([0.5, 4])(
  "ignores click jitter using a pixel threshold at scale %s",
  (scale) => {
    const edge = Object.keys(useEditor.getState().document.segments)[0];
    const drag = gesture(edge, false, scale);
    drag.finish({ x: 50 + 2 / scale, y: 0 }, 1);
    expect(useEditor.getState().selected).toEqual([edge]);
    expect(useEditor.getState().past).toHaveLength(0);
    expect(useEditor.getState().preview).toBeNull();
  },
);
it("does not move a Shift-deselected edge or respond to another pointer", () => {
  const ids = Object.keys(useEditor.getState().document.segments);
  useEditor.setState({ selected: ids });
  const drag = gesture(ids[0], true);
  expect(drag.move({ x: 100, y: 10 }, 2)).toBe(false);
  expect(drag.finish({ x: 100, y: 10 }, 2)).toBe(false);
  drag.finish({ x: 100, y: 10 }, 1);
  expect(useEditor.getState().selected).toEqual([ids[1]]);
  expect(useEditor.getState().past).toHaveLength(0);
});
it("box-selects touching edges in either direction and Shift adds to the selection", () => {
  const doc = useEditor.getState().document;
  const ids = Object.keys(doc.segments);
  const drag = gesture(undefined, false, 2, { x: -10, y: -10 });
  drag.move({ x: 90, y: 10 }, 1);
  expect(drag.box).toEqual({ min: { x: -10, y: -10 }, max: { x: 90, y: 10 } });
  drag.finish({ x: 90, y: 10 }, 1);
  expect(useEditor.getState().selected).toEqual([ids[0]]);
  gesture(undefined, true, 2, { x: 110, y: 110 }).finish({ x: 90, y: -10 }, 1);
  expect(useEditor.getState().selected).toEqual(ids);
  expect(useEditor.getState().document).toEqual(doc);
  expect(useEditor.getState().past).toHaveLength(0);
  gesture().finish({ x: 50, y: 0 }, 1);
  expect(useEditor.getState().selected).toEqual([]);
});
it("cancels movement and prevents stale pointer-up from committing after Escape or pointer cancellation", () => {
  const doc = useEditor.getState().document;
  const drag = gesture(Object.keys(doc.segments)[0]);
  drag.move({ x: 80, y: 10 }, 1);
  useEditor.getState().cancel();
  expect(drag.move({ x: 90, y: 20 }, 1)).toBe(false);
  expect(drag.finish({ x: 90, y: 20 }, 1)).toBe(false);
  expect(useEditor.getState().document).toEqual(doc);
  expect(useEditor.getState().preview).toBeNull();
  expect(useEditor.getState().past).toHaveLength(0);
});
it("does not replace a new selection with a cancelled box gesture", () => {
  const drag = gesture(undefined, false, 2, { x: -10, y: -10 });
  drag.move({ x: 110, y: 110 }, 1);
  editCommands.find((c) => c.id === "select-all")!.run();
  expect(drag.finish({ x: 50, y: 50 }, 1)).toBe(false);
  expect(useEditor.getState().selected).toEqual(
    Object.keys(useEditor.getState().document.segments),
  );
});
it("rejects a move collapsing an unselected neighbour without losing geometry or history", () => {
  const doc = useEditor.getState().document;
  const drag = gesture(Object.keys(doc.segments)[0]);
  expect(() => drag.finish({ x: 50, y: 100 }, 1)).toThrow("Move cancelled");
  expect(useEditor.getState().document).toEqual(doc);
  expect(useEditor.getState().preview).toBeNull();
  expect(useEditor.getState().past).toHaveLength(0);
});
it("select-all cancels previews, selects every edge and switches to Select without an edit", () => {
  const doc = useEditor.getState().document;
  useEditor.setState({
    tool: "line",
    preview: { ...doc, name: "preview" },
    hasDraft: true,
  });
  editCommands.find((c) => c.id === "select-all")!.run();
  expect(useEditor.getState().selected).toEqual(Object.keys(doc.segments));
  expect(useEditor.getState().tool).toBe("select");
  expect(useEditor.getState().preview).toBeNull();
  expect(useEditor.getState().hasDraft).toBe(false);
  expect(useEditor.getState().past).toHaveLength(0);
});
it("deletes the entire selection in one undoable action and removes orphaned points", () => {
  const doc = useEditor.getState().document;
  useEditor.setState({ selected: Object.keys(doc.segments) });
  editCommands.find((c) => c.id === "delete")!.run();
  expect(useEditor.getState().document.segments).toEqual({});
  expect(useEditor.getState().document.points).toEqual({});
  expect(useEditor.getState().selected).toEqual([]);
  expect(useEditor.getState().past).toHaveLength(1);
  useEditor.getState().undo();
  expect(useEditor.getState().document).toEqual(doc);
});
it("resets mixed selected curves in one transaction, retaining every anchor", () => {
  let doc = useEditor.getState().document;
  const ids = Object.keys(doc.segments);
  doc = bendCurve(doc, ids[0], 0.5, { x: 0, y: 20 });
  useEditor.getState().load(doc);
  executeEdgeActions(ids, "reset");
  expect(
    Object.values(useEditor.getState().document.segments).every(
      (e) => e.kind === "line",
    ),
  ).toBe(true);
  expect(useEditor.getState().document.points).toEqual(doc.points);
  expect(useEditor.getState().selected).toEqual(ids);
  expect(useEditor.getState().past).toHaveLength(1);
  useEditor.getState().undo();
  expect(useEditor.getState().document).toEqual(doc);
});
it("rejects a stale batch target without applying partial edits", () => {
  const doc = useEditor.getState().document;
  expect(() =>
    deleteSelection([...Object.keys(doc.segments), "missing"]),
  ).toThrow("no longer exists");
  expect(useEditor.getState().document).toEqual(doc);
  expect(useEditor.getState().past).toHaveLength(0);
});
it("highlights every selected edge and hides individual handles for group movement", () => {
  const doc = useEditor.getState().document;
  const html = renderToStaticMarkup(
    createElement(
      "svg",
      {},
      createElement(SvgGeometry, {
        doc,
        selectedIds: Object.keys(doc.segments),
        scale: 2,
      }),
    ),
  );
  expect(html.match(/class="selected edge"/g)).toHaveLength(2);
  expect(html).not.toContain("data-point=");
  expect(html).not.toContain("data-handle=");
});
it("cannot apply a drag to a newly loaded document", () => {
  const drag = gesture(Object.keys(useEditor.getState().document.segments)[0]);
  drag.move({ x: 60, y: 20 }, 1);
  const replacement = emptyDocument("replacement");
  useEditor.getState().load(replacement);
  expect(drag.finish({ x: 70, y: 20 }, 1)).toBe(false);
  expect(useEditor.getState().document).toEqual(replacement);
  expect(useEditor.getState().past).toHaveLength(0);
});
it("rejects out-of-range movement without committing any selected edge", () => {
  const doc = useEditor.getState().document;
  useEditor.setState({ selected: Object.keys(doc.segments) });
  const drag = gesture(Object.keys(doc.segments)[0]);
  expect(() => drag.finish({ x: 2e7, y: 0 }, 1)).toThrow("coordinate range");
  expect(useEditor.getState().document).toEqual(doc);
  expect(useEditor.getState().preview).toBeNull();
  expect(useEditor.getState().past).toHaveLength(0);
});
