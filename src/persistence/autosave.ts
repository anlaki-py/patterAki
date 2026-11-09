import { settingsFromState } from "../editor/settings";
import { useEditor } from "../editor/store";
import {
  latestProject,
  loadEditorSettings,
  saveEditorSettings,
  saveProject,
} from "./projects";
export async function saveNow(): Promise<boolean> {
  const { document, revision, ready } = useEditor.getState();
  if (!ready) return false;
  useEditor.setState({ saveStatus: "Saving…" });
  try {
    await saveProject(document);
    if (useEditor.getState().revision === revision)
      useEditor.setState({ saveStatus: "Saved locally" });
    return true;
  } catch {
    useEditor.setState({
      saveStatus: "Save failed. Export JSON to keep a backup.",
    });
    return false;
  }
}
export function startPersistence() {
  let timer: ReturnType<typeof setTimeout>;
  let settingsTimer: ReturnType<typeof setTimeout>;
  let disposed = false;
  let settingsReady = false;
  let lastSettings = "";
  void latestProject()
    .then((doc) => {
      if (disposed) return;
      if (doc) useEditor.getState().load(doc);
      useEditor.setState({
        ready: true,
        saveStatus: doc ? "Saved locally" : "Unsaved",
      });
    })
    .catch(() => {
      if (!disposed)
        useEditor.setState({
          ready: true,
          saveStatus:
            "Could not open local storage. Export JSON to keep a backup.",
        });
    });
  void loadEditorSettings()
    .then((settings) => {
      if (disposed) return;
      useEditor.getState().applySettings(settings);
      lastSettings = JSON.stringify(settings);
      settingsReady = true;
    })
    .catch(() => {
      settingsReady = true;
    });
  const unsubscribe = useEditor.subscribe((state, previous) => {
    if (state.ready && state.revision !== previous.revision) {
      clearTimeout(timer);
      timer = setTimeout(() => void saveNow(), 500);
    }
    if (!settingsReady) return;
    const next = settingsFromState(state),
      serialized = JSON.stringify(next);
    if (serialized === lastSettings) return;
    lastSettings = serialized;
    clearTimeout(settingsTimer);
    settingsTimer = setTimeout(() => {
      void saveEditorSettings(next).catch(() => undefined);
    }, 300);
  });
  const beforeUnload = (event: BeforeUnloadEvent) => {
    const s = useEditor.getState();
    if (s.saveStatus !== "Saved locally" || s.preview || s.hasDraft)
      event.preventDefault();
  };
  window.addEventListener("beforeunload", beforeUnload);
  return () => {
    disposed = true;
    clearTimeout(timer);
    clearTimeout(settingsTimer);
    unsubscribe();
    window.removeEventListener("beforeunload", beforeUnload);
  };
}
