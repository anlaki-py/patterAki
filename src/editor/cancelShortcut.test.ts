import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchShortcut } from "./command";
import { useEditor } from "./store";

function pressEscape(shiftKey = false) {
  const preventDefault = vi.fn();
  const handled = dispatchShortcut(
    {
      key: "Escape",
      ctrlKey: false,
      metaKey: false,
      shiftKey,
      altKey: false,
      isComposing: false,
      defaultPrevented: false,
      target: null,
      preventDefault,
    },
    [],
  );
  return { handled, preventDefault };
}
afterEach(() => {
  useEditor.setState({ hasDraft: false, preview: null, gestureActive: false });
});

describe("Escape cancels in-progress actions", () => {
  it("cancels after the first line point and preserves the document", () => {
    const s = useEditor.getState();
    useEditor.setState({ hasDraft: true });
    const result = pressEscape();
    expect(result.handled).toBe(true);
    expect(result.preventDefault).toHaveBeenCalledOnce();
    expect(useEditor.getState().hasDraft).toBe(false);
    expect(useEditor.getState().cancelVersion).toBe(s.cancelVersion + 1);
    expect(useEditor.getState().document).toBe(s.document);
  });

  it("cancels a previewed drag without committing it", () => {
    const s = useEditor.getState();
    useEditor.setState({ preview: s.document, gestureActive: true });
    const result = pressEscape();
    expect(result.handled).toBe(true);
    expect(useEditor.getState().preview).toBe(null);
    expect(useEditor.getState().gestureActive).toBe(false);
    expect(useEditor.getState().revision).toBe(s.revision);
  });

  it("cancels even if Shift is still held during drawing", () => {
    useEditor.setState({ hasDraft: true });
    expect(pressEscape(true).handled).toBe(true);
    expect(useEditor.getState().hasDraft).toBe(false);
  });

  it("does not steal Escape when there is no active operation", () => {
    useEditor.setState({
      hasDraft: false,
      gestureActive: false,
      preview: null,
    });
    const result = pressEscape();
    expect(result.handled).toBe(false);
    expect(result.preventDefault).not.toHaveBeenCalled();
  });
});
