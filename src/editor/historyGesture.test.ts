import { beforeEach, expect, it } from "vitest";
import { emptyDocument } from "../document/schema";
import { commands } from "./commands";
import { useEditor } from "./store";

beforeEach(() => {
  useEditor.getState().load(emptyDocument("history-gesture"));
});

it.each(["undo", "redo"] as const)(
  "%s cancels a gesture before its first preview without traversing history",
  (action) => {
    const initial = useEditor.getState().document;
    useEditor.getState().commit({ ...initial, name: "Renamed" });
    if (action === "redo") useEditor.getState().undo();
    const before = useEditor.getState();
    useEditor.setState({ gestureActive: true });

    commands[action].bind().run();

    const after = useEditor.getState();
    expect(after.document).toBe(before.document);
    expect(after.past).toBe(before.past);
    expect(after.future).toBe(before.future);
    expect(after.revision).toBe(before.revision);
    expect(after.gestureActive).toBe(false);
    expect(after.cancelVersion).toBe(before.cancelVersion + 1);
    commands[action].bind().run();
    expect(useEditor.getState().document.name).toBe(
      action === "undo" ? initial.name : "Renamed",
    );
  },
);

it.each(["undo", "redo"] as const)(
  "%s is available to cancel a gesture even with empty history",
  (action) => {
    const before = useEditor.getState();
    useEditor.setState({ gestureActive: true });
    const command = commands[action].bind();
    expect(command.enabled()).toBe(true);
    command.run();
    expect(useEditor.getState().gestureActive).toBe(false);
    expect(useEditor.getState().document).toBe(before.document);
  },
);
