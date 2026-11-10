import { afterEach, describe, expect, it, vi } from "vitest";
import { hasOpenShortcutOverlay } from "./command";

afterEach(() => vi.unstubAllGlobals());

describe("shortcut overlay compatibility", () => {
  it("honors a document that only implements querySelector", () => {
    vi.stubGlobal("document", { querySelector: () => ({}) });
    expect(hasOpenShortcutOverlay()).toBe(true);
  });

  it("does not treat an empty partial document as an overlay", () => {
    vi.stubGlobal("document", { querySelector: () => null });
    expect(hasOpenShortcutOverlay()).toBe(false);
  });

  it("ignores hidden overlays when querySelectorAll is available", () => {
    const hiddenOverlay = {
      closest: () => ({}),
    };
    vi.stubGlobal("document", { querySelectorAll: () => [hiddenOverlay] });
    expect(hasOpenShortcutOverlay()).toBe(false);
  });
});
