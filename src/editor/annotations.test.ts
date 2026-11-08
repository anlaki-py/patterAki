import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it } from "vitest";
import { newAnnotation, putAnnotation } from "../document/annotations";
import { addPath } from "../document/operations";
import { emptyDocument } from "../document/schema";
import {
  annotationFields,
  commitAnnotation,
  previewAnnotation,
  type AnnotationSession,
} from "./annotationEdit";
import { editCommands } from "./commands";
import { contextTarget } from "./contextTarget";
import { beginSelectionDrag } from "./selectionDrag";
import { deleteSelection } from "./selectionActions";
import { SvgAnnotations } from "./SvgAnnotations";
import { useEditor } from "./store";
function fixture() {
  let i = 0;
  return addPath(
    emptyDocument("test"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    false,
    () => `edge-${++i}`,
  );
}
beforeEach(() => {
  useEditor.getState().load(fixture());
  useEditor.setState({ tool: "select" });
});
function session(kind: "text" | "arrow" = "text"): AnnotationSession {
  const s = useEditor.getState();
  return {
    base: s.document,
    annotation: newAnnotation(kind, { x: 20, y: 40 }, "mark"),
    revision: s.revision,
    cancelVersion: s.cancelVersion,
  };
}
it("previews text and font size then commits them together as one history entry", () => {
  const edit = session(),
    fields = {
      ...annotationFields(edit.annotation, "cm"),
      text: "Front bodice\nCut 2 mirrored",
      size: 0.8,
      rotation: 15,
    };
  const preview = previewAnnotation(edit, fields);
  useEditor.setState({ preview });
  expect(useEditor.getState().document.annotations).toEqual({});
  expect(useEditor.getState().past).toHaveLength(0);
  expect(preview.annotations.mark).toMatchObject({
    text: fields.text,
    fontSizeMm: 8,
    rotation: 15,
  });
  commitAnnotation(edit, fields);
  expect(useEditor.getState().past).toHaveLength(1);
  expect(useEditor.getState().selected).toEqual(["mark"]);
  useEditor.getState().undo();
  expect(useEditor.getState().document).toEqual(edit.base);
  useEditor.getState().redo();
  expect(useEditor.getState().document).toEqual(preview);
});
it("edits an existing arrow's label, length and direction", () => {
  const base = putAnnotation(
    fixture(),
    newAnnotation("arrow", { x: 20, y: 40 }, "mark"),
  );
  useEditor.getState().load(base);
  const edit = { ...session("arrow"), annotation: base.annotations.mark };
  commitAnnotation(edit, {
    text: "Center front",
    size: 0.4,
    length: 12,
    rotation: -90,
  });
  expect(useEditor.getState().document.annotations.mark).toMatchObject({
    label: "Center front",
    lengthMm: 120,
    rotation: -90,
  });
  expect(useEditor.getState().document.points).toEqual(base.points);
});
it.each(["", 0, -1, NaN, Infinity])(
  "rejects invalid size %s without committing geometry or a mark",
  (size) => {
    const edit = session();
    expect(() =>
      commitAnnotation(edit, {
        ...annotationFields(edit.annotation, "cm"),
        size,
      }),
    ).toThrow("Size");
    expect(useEditor.getState().document).toEqual(edit.base);
    expect(useEditor.getState().past).toHaveLength(0);
  },
);
it("cancels previews and refuses stale editor commits after cancellation or a document change", () => {
  const edit = session(),
    fields = annotationFields(edit.annotation, "cm");
  useEditor.setState({ preview: previewAnnotation(edit, fields) });
  useEditor.getState().cancel();
  expect(useEditor.getState().preview).toBeNull();
  expect(() => commitAnnotation(edit, fields)).toThrow("pattern changed");
  const another = session();
  useEditor.getState().commit({ ...another.base, name: "changed" });
  expect(() => commitAnnotation(another, fields)).toThrow("pattern changed");
  expect(useEditor.getState().document.annotations).toEqual({});
});
it("selects all marks and edges, drags a mixed group and deletes it in one transaction", () => {
  const doc = putAnnotation(
    fixture(),
    newAnnotation("text", { x: 20, y: 40 }, "mark"),
  );
  useEditor.getState().load(doc);
  editCommands.find((command) => command.id === "select-all")!.run();
  expect(useEditor.getState().selected).toEqual([
    ...Object.keys(doc.segments),
    "mark",
  ]);
  const drag = beginSelectionDrag({
    itemId: "mark",
    point: { x: 20, y: 40 },
    pointer: 1,
    scale: 2,
    additive: false,
  });
  drag.move({ x: 30, y: 45 }, 1);
  expect(useEditor.getState().document).toEqual(doc);
  drag.finish({ x: 30, y: 45 }, 1);
  expect(useEditor.getState().document.annotations.mark.position).toEqual({
    x: 30,
    y: 45,
  });
  expect(useEditor.getState().past).toHaveLength(1);
  const moved = useEditor.getState().document;
  editCommands.find((command) => command.id === "delete")!.run();
  expect(useEditor.getState().document.annotations).toEqual({});
  expect(useEditor.getState().document.segments).toEqual({});
  expect(useEditor.getState().past).toHaveLength(2);
  useEditor.getState().undo();
  expect(useEditor.getState().document).toEqual(moved);
});
it("deleting only a mark preserves all fabric points, including unconnected imported points", () => {
  let doc = putAnnotation(
    fixture(),
    newAnnotation("text", { x: 20, y: 40 }, "mark"),
  );
  doc = { ...doc, points: { ...doc.points, unused: { x: 700, y: 700 } } };
  useEditor.getState().load(doc);
  deleteSelection(["mark"]);
  expect(useEditor.getState().document.points).toEqual(doc.points);
  expect(useEditor.getState().document.segments).toEqual(doc.segments);
});
it("box-selects partially intersected marks and supports Shift toggling", () => {
  const doc = putAnnotation(
    fixture(),
    newAnnotation("arrow", { x: 20, y: 40 }, "mark"),
  );
  useEditor.getState().load(doc);
  const drag = beginSelectionDrag({
    point: { x: 30, y: 35 },
    pointer: 1,
    scale: 2,
    additive: false,
  });
  drag.finish({ x: 35, y: 45 }, 1);
  expect(useEditor.getState().selected).toEqual(["mark"]);
  const toggle = beginSelectionDrag({
    itemId: "mark",
    point: { x: 30, y: 40 },
    pointer: 1,
    scale: 2,
    additive: true,
  });
  toggle.finish({ x: 30, y: 40 }, 1);
  expect(useEditor.getState().selected).toEqual([]);
});
it("routes empty-space, edge and annotation menus independently", () => {
  const doc = putAnnotation(
    fixture(),
    newAnnotation("text", { x: 20, y: 40 }, "mark"),
  );
  expect(contextTarget(doc, { x: 500, y: 500 }, 4)).toEqual({ kind: "empty" });
  expect(contextTarget(doc, { x: 50, y: 0 }, 4)).toEqual({
    kind: "edge",
    id: Object.keys(doc.segments)[0],
  });
  expect(contextTarget(doc, { x: 21, y: 41 }, 4)).toEqual({
    kind: "annotation",
    id: "mark",
  });
});
it("renders text as escaped SVG content with physical size and mark hit targets", () => {
  const mark = newAnnotation("text", { x: 20, y: 40 }, "mark");
  if (mark.kind !== "text") throw new Error("Expected text");
  mark.text = "<script>bad()</script>\nCut 2";
  mark.fontSizeMm = 8;
  const doc = putAnnotation(fixture(), mark);
  const html = renderToStaticMarkup(
    createElement(
      "svg",
      {},
      createElement(SvgAnnotations, { doc, selected: ["mark"], scale: 2 }),
    ),
  );
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain('font-size="8"');
  expect(html).toContain('data-annotation="mark"');
  expect(html).toContain('class="annotation selected"');
});
