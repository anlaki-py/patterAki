import { settingsFromState } from "../editor/settings";
import { useEditor } from "../editor/store";
import { latestProject, saveProject } from "./projects";
import { projectSettings, rememberProject } from "./preferences";
import { onProjectWrite, repository } from "./repository";

export async function saveNow(): Promise<boolean> {
  const state = useEditor.getState();
  const { document, revision, ready } = state;
  if (!ready) return false;
  const settings = settingsFromState(state);
  const fingerprint = JSON.stringify(settings);
  const isCurrent = () => {
    const s = useEditor.getState();
    return (
      s.document.id === document.id &&
      s.revision === revision &&
      JSON.stringify(settingsFromState(s)) === fingerprint
    );
  };
  useEditor.setState({ saveStatus: "Saving…" });
  try {
    await saveProject(document, settings);
    if (isCurrent()) {
      await rememberProject(document.id);
      if (!isCurrent()) return false;
      useEditor.setState({ saveStatus: "Saved locally" });
      return true;
    }
    return false;
  } catch (cause) {
    if (isCurrent())
      useEditor.setState({
        saveStatus: `Save failed. ${cause instanceof Error ? cause.message : "Local storage is unavailable."} Retry, save a recovery copy, or export JSON.`,
      });
    return false;
  }
}
export function needsLeaveWarning() {
  const s = useEditor.getState();
  return (
    s.ready &&
    (s.saveStatus !== "Saved locally" ||
      !!s.preview ||
      s.hasDraft ||
      s.gestureActive)
  );
}
export function startPersistence() {
  let timer: ReturnType<typeof setTimeout>;
  let disposed = false,
    initialized = false;
  void (async () => {
    try {
      const doc = await latestProject();
      const settings = await projectSettings(
        doc?.id ?? useEditor.getState().document.id,
      );
      if (disposed) return;
      if (doc) await rememberProject(doc.id);
      if (disposed) return;
      if (doc) useEditor.getState().load(doc);
      useEditor.getState().applySettings(settings);
      initialized = true;
      useEditor.setState({
        ready: true,
        saveStatus: doc ? "Saved locally" : "Unsaved",
      });
    } catch (cause) {
      if (disposed) return;
      initialized = true;
      useEditor.setState({
        ready: true,
        saveStatus: `Could not open local storage. ${cause instanceof Error ? cause.message : "Storage unavailable."} Open projects for recovery or export JSON.`,
      });
    }
  })();
  const unsubscribe = useEditor.subscribe((s, previous) => {
    if (!initialized || !s.ready) return;
    if (
      s.revision === previous.revision &&
      JSON.stringify(settingsFromState(s)) ===
        JSON.stringify(settingsFromState(previous))
    )
      return;
    clearTimeout(timer);
    if (s.revision === previous.revision)
      useEditor.setState({ saveStatus: "Unsaved preferences" });
    timer = setTimeout(() => {
      if (useEditor.getState().saveStatus !== "Saved locally") void saveNow();
    }, 500);
  });
  let channel: BroadcastChannel | undefined;
  try {
    if (typeof BroadcastChannel !== "undefined")
      channel = new BroadcastChannel("patternaki.projects.v1");
  } catch {
    // Restricted contexts still use focus checks and the atomic write guard.
  }
  const check = () => {
    const id = useEditor.getState().document.id;
    if (!initialized) return;
    void repository()
      .conflicted(id)
      .then((conflict) => {
        if (!disposed && conflict && useEditor.getState().document.id === id)
          useEditor.setState({
            saveStatus:
              "Conflict: another tab changed or deleted this project. Export JSON, save a recovery copy, or reload the saved version.",
          });
      })
      .catch(() => {
        if (!disposed && useEditor.getState().document.id === id)
          useEditor.setState({
            saveStatus:
              "Could not check local storage. Export JSON before leaving.",
          });
      });
  };
  if (channel) channel.onmessage = check;
  const stopBroadcast = onProjectWrite((id) => {
    channel?.postMessage({ projectId: id });
  });
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (needsLeaveWarning()) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  const onHidden = () => {
    if (document.visibilityState === "hidden" && needsLeaveWarning())
      void saveNow();
    else check();
  };
  window.addEventListener("beforeunload", beforeUnload);
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", onHidden);
  return () => {
    disposed = true;
    clearTimeout(timer);
    unsubscribe();
    stopBroadcast();
    channel?.close();
    window.removeEventListener("beforeunload", beforeUnload);
    window.removeEventListener("focus", check);
    document.removeEventListener("visibilitychange", onHidden);
  };
}
