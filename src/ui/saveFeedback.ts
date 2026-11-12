export type SaveKind = "dirty" | "saving" | "saved" | "error";

/** Classify legacy store messages without changing the undo/history model. */
export function saveKind(status: string): SaveKind {
  if (/failed|could not|error|unavailable|conflict/i.test(status))
    return "error";
  if (/saving|opening|deleting/i.test(status)) return "saving";
  if (/saved locally/i.test(status)) return "saved";
  return "dirty";
}
