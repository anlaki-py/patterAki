import { projectBackup } from "../persistence/referenceBackup";
import { notifications } from "@mantine/notifications";
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
  void projectBackup(doc)
    .then((value) => downloadProjectJson(value, doc.name))
    .catch((cause) => {
      downloadProjectJson(doc, `${doc.name} geometry only`);
      notifications.show({
        color: "orange",
        message: `${(cause as Error).message} Geometry-only JSON was downloaded; retain the original image files separately.`,
      });
    });
}
