import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditor } from "../editor/store";
import { defaultSettings } from "../editor/settings";
import { emptyDocument } from "../document/schema";
const mock = vi.hoisted(() => ({ saveProject: vi.fn() }));
vi.mock("./projects", async (original) => ({
  ...(await original<typeof import("./projects")>()),
  saveProject: mock.saveProject,
}));
import { saveNow, needsLeaveWarning } from "./autosave";
describe("save status and committed-state protection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useEditor.getState().load(emptyDocument("p1"));
    useEditor.setState({ ...structuredClone(defaultSettings), ready: true });
  });
  it("saves geometry and project preferences from one snapshot", async () => {
    mock.saveProject.mockResolvedValue(undefined);
    useEditor.setState({ snap: false });
    const result = saveNow();
    expect(useEditor.getState().saveStatus).toBe("Saving…");
    expect(await result).toBe(true);
    expect(mock.saveProject).toHaveBeenCalledWith(
      useEditor.getState().document,
      expect.objectContaining({ snap: false }),
    );
    expect(needsLeaveWarning()).toBe(false);
  });
  it("preserves failure state until a successful retry", async () => {
    mock.saveProject.mockRejectedValueOnce(new Error("QuotaExceededError"));
    expect(await saveNow()).toBe(false);
    expect(useEditor.getState().saveStatus).toMatch(
      /Save failed.*QuotaExceededError/,
    );
    expect(needsLeaveWarning()).toBe(true);
    mock.saveProject.mockResolvedValueOnce(undefined);
    expect(await saveNow()).toBe(true);
  });
  it("does not approve switching after a newer document or preference edit", async () => {
    let release!: () => void;
    mock.saveProject.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const first = saveNow();
    useEditor
      .getState()
      .commit({ ...useEditor.getState().document, name: "New revision" });
    release();
    expect(await first).toBe(false);
    const second = saveNow();
    useEditor.setState({ snap: false });
    release();
    expect(await second).toBe(false);
  });
  it("does not overwrite another project's status when an old write fails", async () => {
    let fail!: (cause: Error) => void;
    mock.saveProject.mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject;
        }),
    );
    const pending = saveNow();
    useEditor.getState().load(emptyDocument("p2"));
    fail(new Error("Storage unavailable"));
    expect(await pending).toBe(false);
    expect(useEditor.getState().saveStatus).toBe("Unsaved");
  });
  it("warns about unfinished drags/drafts without ever passing previews to persistence", async () => {
    mock.saveProject.mockResolvedValue(undefined);
    const committed = useEditor.getState().document;
    useEditor.setState({
      preview: { ...committed, name: "Transient" },
      hasDraft: true,
      gestureActive: true,
    });
    expect(await saveNow()).toBe(true);
    expect(mock.saveProject.mock.calls[0][0]).toEqual(committed);
    expect(needsLeaveWarning()).toBe(true);
    useEditor.getState().cancel();
    expect(needsLeaveWarning()).toBe(false);
  });
});
