import { describe, expect, it } from "vitest";
import { saveKind } from "./saveFeedback";

describe("M0.2 save feedback", () => {
  it("distinguishes uncommitted work, pending writes and confirmed writes", () => {
    expect(saveKind("Unsaved")).toBe("dirty");
    expect(saveKind("Unsaved changes")).toBe("dirty");
    expect(saveKind("Saving…")).toBe("saving");
    expect(saveKind("Saved locally")).toBe("saved");
  });
  it("makes quota and startup failures actionable", () => {
    expect(saveKind("Save failed. Export JSON to keep a backup.")).toBe(
      "error",
    );
    expect(saveKind("Could not open local storage.")).toBe("error");
  });
});
