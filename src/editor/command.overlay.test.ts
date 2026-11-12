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

  it.each([false, true])(
    "only blocks shortcuts for a listbox with a rendered box: visible=%s",
    (visible) => {
      const listbox = {
        closest: () => null,
        getClientRects: () => (visible ? [{}] : []),
      };
      vi.stubGlobal("document", { querySelectorAll: () => [listbox] });
      vi.stubGlobal("window", {
        getComputedStyle: () => ({ display: "block", visibility: "visible" }),
      });
      expect(hasOpenShortcutOverlay()).toBe(visible);
    },
  );

  it("keeps a rendered but invisible overlay from blocking shortcuts", () => {
    vi.stubGlobal("document", {
      querySelectorAll: () => [
        { closest: () => null, getClientRects: () => [{}] },
      ],
    });
    vi.stubGlobal("window", {
      getComputedStyle: () => ({ display: "block", visibility: "hidden" }),
    });
    expect(hasOpenShortcutOverlay()).toBe(false);
  });
});
