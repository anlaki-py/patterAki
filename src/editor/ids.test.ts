import { afterEach, expect, it, vi } from "vitest";
import { createId } from "./ids";
import { documentSchema } from "../document/schema";
const getRandomValues = globalThis.crypto.getRandomValues.bind(
  globalThis.crypto,
);
afterEach(() => vi.unstubAllGlobals());
it("uses the native UUID generator when available", () => {
  const randomUUID = vi.fn(() => "native-id");
  vi.stubGlobal("crypto", { randomUUID, getRandomValues });
  expect(createId()).toBe("native-id");
  expect(randomUUID).toHaveBeenCalledOnce();
});
it("creates distinct opaque IDs without randomUUID on HTTP LAN origins", () => {
  vi.stubGlobal("crypto", { getRandomValues });
  const ids = Array.from({ length: 100 }, createId);
  expect(new Set(ids).size).toBe(100);
  for (const id of ids) expect(id).toMatch(/^[0-9a-f]{32}$/);
});
it("initializes the editor store when randomUUID is unavailable", async () => {
  vi.stubGlobal("crypto", { getRandomValues });
  vi.resetModules();
  const { useEditor } = await import("./store");
  const doc = useEditor.getState().document;
  expect(doc.id).toMatch(/^[0-9a-f]{32}$/);
  expect(documentSchema.safeParse(doc).success).toBe(true);
});
