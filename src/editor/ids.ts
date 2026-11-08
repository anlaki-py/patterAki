/** Document IDs are opaque strings, not authentication tokens or UUID-only fields. */
export function createId(): string {
  if (typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // getRandomValues remains available on HTTP LAN origins, unlike randomUUID.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
