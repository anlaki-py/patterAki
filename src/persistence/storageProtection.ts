export async function requestStorageProtection(
  storage:
    Partial<Pick<StorageManager, "persist">> | undefined = typeof navigator !==
  "undefined"
    ? navigator.storage
    : undefined,
) {
  if (!storage?.persist)
    return "Persistent storage is unavailable in this browser. Keep JSON backups; local projects may be evicted.";
  try {
    if (await storage.persist())
      return "Persistent storage granted. This reduces eviction risk, but clearing browser data can still remove projects. Keep JSON backups.";
    return "Persistent storage was not granted. Editing still works; the browser may evict local data. Keep JSON backups.";
  } catch {
    return "Could not request persistent storage. Editing still works; keep JSON backups.";
  }
}
