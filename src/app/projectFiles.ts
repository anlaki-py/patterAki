import { useEditor } from "../editor/store";
import { downloadFile } from "../export/download";
export function downloadProjectJson(value: unknown, name: string) {
  downloadFile(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    name,
    "json",
  );
}
export function exportJson() {
  const doc = useEditor.getState().document;
  downloadProjectJson(doc, doc.name);
}
