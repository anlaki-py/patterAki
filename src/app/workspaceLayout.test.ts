import { describe, expect, it } from "vitest";
import {
  WORKSPACE_LAYOUT_KEY,
  defaultWorkspaceLayout,
  normalizeWorkspaceLayout,
  readWorkspaceLayout,
  saveWorkspaceLayout,
} from "./workspaceLayout";

describe("workspace layout (M0.2)", () => {
  it("defaults to a hidden inspector and a useful width", () => {
    expect(readWorkspaceLayout(null)).toEqual(defaultWorkspaceLayout);
    expect(readWorkspaceLayout({ getItem: () => "broken" })).toEqual(
      defaultWorkspaceLayout,
    );
  });
  it("survives storage round trips without entering the project document", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
    expect(
      saveWorkspaceLayout(
        { inspectorVisible: true, inspectorWidthPct: 36.3 },
        storage,
      ),
    ).toBe(true);
    expect(data.has(WORKSPACE_LAYOUT_KEY)).toBe(true);
    expect(readWorkspaceLayout(storage)).toEqual({
      inspectorVisible: true,
      inspectorWidthPct: 36.3,
    });
    expect(saveWorkspaceLayout({ ...defaultWorkspaceLayout }, storage)).toBe(
      true,
    );
    expect(readWorkspaceLayout(storage)).toEqual(defaultWorkspaceLayout);
  });
  it("rejects corrupt values and clamps unsafe widths", () => {
    expect(
      normalizeWorkspaceLayout({
        inspectorVisible: "yes",
        inspectorWidthPct: Infinity,
      }),
    ).toEqual(defaultWorkspaceLayout);
    expect(
      normalizeWorkspaceLayout({ inspectorVisible: true, inspectorWidthPct: 4 })
        .inspectorWidthPct,
    ).toBe(22);
    expect(
      normalizeWorkspaceLayout({
        inspectorVisible: false,
        inspectorWidthPct: 75,
      }).inspectorWidthPct,
    ).toBe(40);
  });
  it("never throws when storage is unavailable", () => {
    expect(
      readWorkspaceLayout({
        getItem: () => {
          throw Error("blocked");
        },
      }),
    ).toEqual(defaultWorkspaceLayout);
    expect(
      saveWorkspaceLayout(
        { ...defaultWorkspaceLayout },
        {
          setItem: () => {
            throw Error("quota");
          },
        },
      ),
    ).toBe(false);
  });
});
