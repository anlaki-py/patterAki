import { expect, it, vi } from "vitest";
import { requestStorageProtection } from "./storageProtection";
it("explains granted, denied, unavailable and failed persistence requests without promising permanent storage", async () => {
  const granted = {
    persist: vi.fn(async () => true),
  };
  expect(await requestStorageProtection(granted)).toMatch(
    /granted.*clearing browser data/,
  );
  expect(granted.persist).toHaveBeenCalledOnce();
  expect(
    await requestStorageProtection({
      persist: async () => false,
    }),
  ).toMatch(/not granted.*evict/);
  expect(await requestStorageProtection({})).toMatch(/unavailable.*backups/);
  expect(
    await requestStorageProtection({
      persist: async () => {
        throw new Error("Denied");
      },
    }),
  ).toMatch(/Could not request.*backups/);
});
