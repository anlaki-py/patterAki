import { useEditor } from "../editor/store";
import { latestProject, saveProject } from "./projects";
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
  let disposed = false;
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
  const unsubscribe = useEditor.subscribe((state, previous) => {
    if (state.ready && state.revision !== previous.revision) {
      clearTimeout(timer);
      timer = setTimeout(() => void saveNow(), 500);
    }
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
    unsubscribe();
    window.removeEventListener("beforeunload", beforeUnload);
  };
}
