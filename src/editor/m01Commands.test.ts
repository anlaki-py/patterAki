import { afterEach, describe, expect, it, vi } from "vitest";
import {
  commandRegistry,
  commands,
  dispatchShortcut,
  toolCommands,
} from "./commands";
import { shortcutReference } from "../app/ShortcutHelp";

const keyEvent = (key: string) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  isComposing: false,
  defaultPrevented: false,
  target: null,
  preventDefault: vi.fn(),
});

afterEach(() => vi.unstubAllGlobals());

describe("M0.1 consistent commands", () => {
  it("registers the whole File/View/Pattern/Help command set with unique IDs", () => {
    const ids = commandRegistry.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        "project.new",
        "project.open",
        "project.rename-dialog",
        "project.save",
        "project.import",
        "project.export",
        "project.delete",
        "project.rename",
        "help.controls",
        "help.shortcuts",
        "piece.create-from-contour",
        "view.grid",
        "view.snap",
        "view.theme",
        "view.properties",
      ]),
    );
  });

  it("derives visible help shortcuts from the real registry, preserving existing tool keys", () => {
    const reference = shortcutReference();
    expect(reference).toEqual(
      commandRegistry
        .filter((command) => command.shortcut)
        .map(({ id, label, shortcut }) => ({ id, label, shortcut })),
    );
    for (const [id, expectedKey] of [
      ["select", "V"],
      ["line", "L"],
      ["polyline", "P"],
      ["rectangle", "R"],
      ["curve", "C"],
      ["point", "X"],
      ["pan", "H"],
    ]) {
      expect(reference.find((item) => item.id === id)?.shortcut).toBe(
        expectedKey,
      );
    }
    expect(
      reference.find((item) => item.id === commands.save.id)?.shortcut,
    ).toBe("Ctrl/Cmd+S");
  });

  it("does not invoke tool shortcuts while an active modal or menu owns keyboard focus", () => {
    vi.stubGlobal("document", { querySelector: () => ({}) });
    const event = keyEvent("l");
    expect(dispatchShortcut(event, toolCommands)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("disabled menu commands recheck availability rather than executing stale actions", () => {
    let enabled = false;
    const execute = vi.fn();
    const bound = commands.openProject.bind({
      execute,
      enabled: () => enabled,
    });
    bound.run();
    expect(execute).not.toHaveBeenCalled();
    enabled = true;
    bound.run();
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
