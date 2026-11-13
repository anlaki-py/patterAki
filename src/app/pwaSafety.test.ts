import { beforeEach, expect, it, vi } from "vitest";
import { useEditor } from "../editor/store";
import { emptyDocument } from "../document/schema";
import { safeguardUpdate } from "./pwaSafety";
beforeEach(() => {
  useEditor.getState().load(emptyDocument("pwa"));
  useEditor.setState({ ready: true, saveStatus: "Saved locally" });
});
it("blocks update while drawing, dragging or previewing", async () => {
  for (const state of [
    { hasDraft: true },
    { gestureActive: true },
    { preview: emptyDocument("preview") },
  ]) {
    useEditor.setState({
      hasDraft: false,
      gestureActive: false,
      preview: null,
      ...state,
    });
    const save = vi.fn(async () => true);
    await expect(safeguardUpdate(save)).rejects.toThrow("Finish or cancel");
    expect(save).not.toHaveBeenCalled();
  }
});
it("safeguards committed state and refuses quota/save failures", async () => {
  await expect(safeguardUpdate(async () => true)).resolves.toBeUndefined();
  await expect(safeguardUpdate(async () => false)).rejects.toThrow(
    "Could not safeguard",
  );
});
it("refuses reload if an edit arrives during the save", async () => {
  await expect(
    safeguardUpdate(async () => {
      useEditor
        .getState()
        .commit({ ...useEditor.getState().document, name: "newer" });
      return true;
    }),
  ).rejects.toThrow("changed while saving");
  expect(useEditor.getState().document.name).toBe("newer");
});
