import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => {
  const state = {
    document: { id: "p1", name: "Test" },
    revision: 1,
    ready: true,
    saveStatus: "Unsaved",
  };
  return {
    state,
    saveProject: vi.fn(),
  };
});

vi.mock("../editor/store", () => ({
  useEditor: {
    getState: () => mock.state,
    setState: (patch: { saveStatus: string }) =>
      Object.assign(mock.state, patch),
  },
}));
vi.mock("./projects", () => ({
  saveProject: mock.saveProject,
  latestProject: vi.fn(),
  loadEditorSettings: vi.fn(),
  saveEditorSettings: vi.fn(),
}));

import { saveNow } from "./autosave";

describe("M0.2 save status and recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.state.document.id = "p1";
    mock.state.revision = 1;
    mock.state.ready = true;
    mock.state.saveStatus = "Unsaved";
  });

  it("moves from saving to saved when the current revision was persisted", async () => {
    mock.saveProject.mockResolvedValue(undefined);
    const result = saveNow();
    expect(mock.state.saveStatus).toBe("Saving…");
    expect(await result).toBe(true);
    expect(mock.state.saveStatus).toBe("Saved locally");
  });

  it("preserves a failure state until an explicit successful retry", async () => {
    mock.saveProject.mockRejectedValueOnce(new Error("QuotaExceededError"));
    expect(await saveNow()).toBe(false);
    expect(mock.state.saveStatus).toMatch(/Save failed/);
    mock.saveProject.mockResolvedValueOnce(undefined);
    expect(await saveNow()).toBe(true);
    expect(mock.state.saveStatus).toBe("Saved locally");
  });

  it("cannot mark a newer revision saved or approve a stale switch", async () => {
    let release!: () => void;
    mock.saveProject.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const pending = saveNow();
    mock.state.revision = 2;
    mock.state.saveStatus = "Unsaved";
    release();
    expect(await pending).toBe(false);
    expect(mock.state.saveStatus).toBe("Unsaved");
  });

  it("does not overwrite status for a newer project when an older write fails", async () => {
    let fail!: (error: Error) => void;
    mock.saveProject.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject;
        }),
    );
    const pending = saveNow();
    mock.state.document.id = "p2";
    mock.state.saveStatus = "Unsaved";
    fail(new Error("Storage unavailable"));
    expect(await pending).toBe(false);
    expect(mock.state.saveStatus).toBe("Unsaved");
  });
});
