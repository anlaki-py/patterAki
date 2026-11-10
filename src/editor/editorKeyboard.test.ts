import { afterEach, describe, expect, it, vi } from "vitest";
import { addPath } from "../document/operations";
import { emptyDocument } from "../document/schema";
import { handleEditorEscapeDelete } from "./editorKeyboard";
import { useEditor } from "./store";

const event = (key: string) => {
  const preventDefault = vi.fn();
  return {
    input: {
      key,
      target: null,
      isComposing: false,
      defaultPrevented: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      preventDefault,
    },
    preventDefault,
  };
};
const fixture = () => {
  let next = 0;
  return addPath(
    emptyDocument("shortcuts"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    false,
    () => String(++next),
  );
};

afterEach(() => {
  useEditor.setState({
    hasDraft: false,
    gestureActive: false,
    preview: null,
    activePoint: null,
    selected: [],
  });
});

describe("Escape and Delete on the actual editor state", () => {
  it("cancels after the first drawing click without undoing anything", () => {
    useEditor.getState().load(fixture());
    const start = useEditor.getState();
    useEditor.setState({ hasDraft: true });
    const { input, preventDefault } = event("Escape");
    expect(handleEditorEscapeDelete(input)).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(useEditor.getState().document).toBe(start.document);
    expect(useEditor.getState().revision).toBe(start.revision);
    expect(useEditor.getState().hasDraft).toBe(false);
    expect(useEditor.getState().cancelVersion).toBe(start.cancelVersion + 1);
  });

  it("cancels an uncommitted drag and clears its preview", () => {
    useEditor.getState().load(fixture());
    const start = useEditor.getState();
    useEditor.setState({
      gestureActive: true,
      preview: { ...start.document, name: "preview" },
    });
    const { input } = event("Escape");
    expect(handleEditorEscapeDelete(input)).toBe(true);
    expect(useEditor.getState().preview).toBeNull();
    expect(useEditor.getState().document).toBe(start.document);
  });

  it.each(["Delete", "Backspace"])(
    "deletes selected edges using %s and can undo",
    (key) => {
      useEditor.getState().load(fixture());
      const start = useEditor.getState().document;
      useEditor.setState({ selected: Object.keys(start.segments) });
      const { input, preventDefault } = event(key);
      expect(handleEditorEscapeDelete(input)).toBe(true);
      expect(preventDefault).toHaveBeenCalledOnce();
      expect(Object.keys(useEditor.getState().document.segments)).toHaveLength(
        0,
      );
      useEditor.getState().undo();
      expect(useEditor.getState().document).toEqual(start);
    },
  );

  it("deletes a selected point and its attached edges", () => {
    useEditor.getState().load(fixture());
    const pointId = Object.keys(useEditor.getState().document.points)[0];
    useEditor.setState({ selected: [], activePoint: pointId });
    expect(handleEditorEscapeDelete(event("Backspace").input)).toBe(true);
    expect(useEditor.getState().document.points[pointId]).toBeUndefined();
  });

  it("does not delete a committed selection during an unfinished drawing", () => {
    useEditor.getState().load(fixture());
    const start = useEditor.getState().document;
    useEditor.setState({
      selected: Object.keys(start.segments),
      hasDraft: true,
    });
    expect(handleEditorEscapeDelete(event("Delete").input)).toBe(false);
    expect(useEditor.getState().document).toBe(start);
  });
});
