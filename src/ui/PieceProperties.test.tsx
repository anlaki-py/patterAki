import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { PieceProperties } from "./PieceProperties";
import { theme } from "../app/theme";
import { addPath } from "../document/operations";
import { createPieceFromEdge } from "../document/pieces";
import { duplicatePieces } from "../document/pieceTransforms";
import { emptyDocument } from "../document/schema";
import { useEditor } from "../editor/store";
import { commands } from "../editor/commands";
import { previewPieceRotation } from "../editor/pieceCommands";

// Render the live fixture instead of Zustand's initial server snapshot.
vi.mock("../editor/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../editor/store")>();
  type State = ReturnType<typeof actual.useEditor.getState>;
  return {
    ...actual,
    useEditor: Object.assign((selector?: (state: State) => unknown) => {
      const state = actual.useEditor.getState();
      return selector ? selector(state) : state;
    }, actual.useEditor),
  };
});
let n = 0;
const id = () => `properties-${++n}`;
beforeEach(() => {
  n = 0;
  let doc = addPath(
    emptyDocument("properties"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ],
    true,
    id,
  );
  doc.unitsDisplay = "mm";
  doc = createPieceFromEdge(
    doc,
    Object.keys(doc.segments)[0],
    "front",
    "Front",
  );
  useEditor.getState().load(doc);
  commands.selectPiece.run("front");
});
function markup() {
  return renderToStaticMarkup(
    <MantineProvider theme={theme} env="test">
      <PieceProperties />
    </MantineProvider>,
  );
}
function text() {
  return markup().replace(/<[^>]+>/g, "");
}
it("inspector bounds and rotation both follow the live preview and return on cancel", () => {
  const doc = useEditor.getState().document;
  expect(text()).toContain("Width 100 mm");
  expect(text()).toContain("Rotation 0°");
  previewPieceRotation(90);
  expect(text()).toContain("Width 80 mm");
  expect(text()).toContain("Height 100 mm");
  expect(text()).toContain("Rotation 90°");
  expect(useEditor.getState().document).toBe(doc);
  commands.cancel.run();
  expect(text()).toContain("Rotation 0°");
  expect(text()).toContain("Width 100 mm");
});
it("multi-piece inspection shows combined bounds and each rotation without a misleading single-piece form", () => {
  const doc = duplicatePieces(useEditor.getState().document, ["front"], id, {
    x: 200,
    y: 20,
  }).document;
  useEditor.getState().load(doc);
  commands.selectAll.run();
  const html = markup();
  expect(html).toContain("2 pieces selected");
  expect(html).toContain("Combined bounds");
  expect(text()).toContain("Width 300 mm");
  expect(text()).toContain("Height 100 mm");
  expect(text()).toContain("Front · Rotation 0°");
  expect(text()).toContain("Front copy · Rotation 0°");
  expect(html).not.toContain("Save piece properties");
  previewPieceRotation(90);
  expect(text()).toContain("Front · Rotation 90°");
  expect(text()).toContain("Front copy · Rotation 90°");
});
it("child edges and active vertices retain their parent's measurements and metadata form", () => {
  commands.editPiece.run();
  const s = useEditor.getState();
  const pointId = s.document.segments[s.selected[0]].from;
  expect(text()).toContain("Editing geometry");
  expect(text()).toContain("Width 100 mm");
  useEditor.setState({ selected: [], activePoint: pointId });
  expect(text()).toContain("Editing geometry");
  expect(markup()).toContain("Save piece properties");
});
