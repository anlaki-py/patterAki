/** Local UI preference; intentionally not part of the undoable pattern document. */
export const WORKSPACE_LAYOUT_KEY = "patternaki.workspace-layout.v1";
export type WorkspaceLayout = {
  inspectorVisible: boolean;
  inspectorWidthPct: number;
};

export const defaultWorkspaceLayout: Readonly<WorkspaceLayout> = {
  inspectorVisible: false,
  inspectorWidthPct: 28,
};

export function normalizeWorkspaceLayout(value: unknown): WorkspaceLayout {
  if (!value || typeof value !== "object") return { ...defaultWorkspaceLayout };
  const layout = value as Partial<WorkspaceLayout>;
  const width = layout.inspectorWidthPct;
  return {
    inspectorVisible:
      typeof layout.inspectorVisible === "boolean"
        ? layout.inspectorVisible
        : defaultWorkspaceLayout.inspectorVisible,
    inspectorWidthPct:
      typeof width === "number" && Number.isFinite(width)
        ? Math.min(40, Math.max(22, Math.round(width * 10) / 10))
        : defaultWorkspaceLayout.inspectorWidthPct,
  };
}

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

function localStorageOrNull(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readWorkspaceLayout(
  storage: ReadableStorage | null = localStorageOrNull(),
): WorkspaceLayout {
  try {
    const raw = storage?.getItem(WORKSPACE_LAYOUT_KEY);
    return raw
      ? normalizeWorkspaceLayout(JSON.parse(raw) as unknown)
      : { ...defaultWorkspaceLayout };
  } catch {
    return { ...defaultWorkspaceLayout };
  }
}

export function saveWorkspaceLayout(
  layout: WorkspaceLayout,
  storage: WritableStorage | null = localStorageOrNull(),
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(
      WORKSPACE_LAYOUT_KEY,
      JSON.stringify(normalizeWorkspaceLayout(layout)),
    );
    return true;
  } catch {
    // Private browsing and blocked storage must not prevent editing.
    return false;
  }
}
