import { defineCommand } from "./command";
import { useEditor } from "./store";
import { setSeamAllowance } from "../document/seamAllowance";
import type { SeamAllowance } from "../document/seamSchema";
export const seamCommands = {
  previewSeam: defineCommand<{
    id: string;
    settings: SeamAllowance;
    overrides?: Record<string, number | undefined>;
  }>(
    "seam.preview",
    "Preview seam allowance",
    ({ id, settings, overrides }) => {
      const s = useEditor.getState();
      try {
        useEditor.setState({
          preview: setSeamAllowance(s.document, id, settings, overrides),
          previewIssue: null,
        });
      } catch (error) {
        useEditor.setState({
          preview: null,
          previewIssue:
            error instanceof Error ? error.message : "Invalid allowance.",
        });
      }
    },
  ),
  applySeam: defineCommand(
    "seam.apply",
    "Apply seam allowance",
    () => {
      const s = useEditor.getState();
      try {
        if (!s.preview) return false;
        s.commit(s.preview);
        return true;
      } catch (error) {
        useEditor.setState({
          previewIssue:
            error instanceof Error
              ? error.message
              : "Could not apply seam allowance.",
        });
        return false;
      }
    },
    () => !!useEditor.getState().preview && !useEditor.getState().previewIssue,
  ),
  seamVisibility: defineCommand<"stitch" | "cut" | "both">(
    "seam.visibility",
    "Outline visibility",
    (mode) => useEditor.setState({ outlineVisibility: mode }),
  ),
};
