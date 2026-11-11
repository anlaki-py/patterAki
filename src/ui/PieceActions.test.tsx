import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider, Menu } from "@mantine/core";
import { usePieceActions } from "./PieceActions";
import { addPath } from "../document/operations";
import { emptyDocument } from "../document/schema";
import { createPieceFromEdge } from "../document/pieces";
import { useEditor } from "../editor/store";
import { commands } from "../editor/commands";
import { theme } from "../app/theme";
// Static rendering otherwise uses Zustand's initial server snapshot, before
// these fixtures are loaded. Read the live fixture state for this markup test.
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
let next = 0;
const id = () => `menu-${++next}`;
function MenuProbe() {
  const actions = usePieceActions(() => {});
  return (
    <Menu
      opened
      withinPortal={false}
      keepMounted
      keepMountedMode="display-none"
    >
      <Menu.Target>
        <button>Piece actions</button>
      </Menu.Target>
      <Menu.Dropdown>{actions.items}</Menu.Dropdown>
    </Menu>
  );
}
function renderedItems() {
  const html = renderToStaticMarkup(
    <MantineProvider env="test" theme={theme}>
      <MenuProbe />
    </MantineProvider>,
  );
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(
    (match) => ({
      label: match[2].replace(/<[^>]+>/g, ""),
      disabled: /\bdisabled/.test(match[1]),
    }),
  );
}
beforeEach(() => {
  next = 0;
  const doc = addPath(
    emptyDocument("menus"),
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 80 },
      { x: 0, y: 80 },
    ],
    true,
    id,
  );
  useEditor.getState().load(doc);
  useEditor.setState({
    tool: "select",
    selected: [Object.keys(doc.segments)[0]],
    ready: true,
  });
});
it("renders a named conversion for a closed drafting path without inapplicable piece actions", () => {
  const items = renderedItems();
  expect(
    items.find((item) => item.label.includes("Create piece from closed path"))
      ?.disabled,
  ).toBe(false);
  expect(
    items.some((item) => item.label.includes("Rotate selected pieces")),
  ).toBe(false);
  expect(items.some((item) => item.label.includes("Rename piece"))).toBe(false);
  expect(useEditor.getState().document.pieces).toEqual({});
});
it("renders enabled rename, rotate, duplicate, mirror, lock and hide for the parent of a selected piece edge", () => {
  const s = useEditor.getState(),
    first = s.selected[0];
  const doc = createPieceFromEdge(s.document, first, "panel", "Front");
  useEditor.getState().load(doc);
  useEditor.setState({ selected: [first], editPieceId: "panel" });
  const items = renderedItems();
  for (const label of [
    "Rename piece",
    "Rotate selected pieces",
    "Duplicate pieces",
    "Mirror left/right",
    "Mirror top/bottom",
    "Lock selected pieces",
    "Hide selected pieces",
  ]) {
    expect(
      items.find((item) => item.label.includes(label)),
      label,
    ).toMatchObject({ disabled: false });
  }
  expect(
    items.some((item) => item.label.includes("Create piece from closed path")),
  ).toBe(false);
});
it("offers Show and Unlock recovery without opening Properties", () => {
  const s = useEditor.getState();
  const doc = createPieceFromEdge(s.document, s.selected[0], "panel", "Front");
  doc.pieces.panel = { ...doc.pieces.panel, visible: false, locked: true };
  useEditor.getState().load(doc);
  const items = renderedItems();
  expect(items.find((item) => item.label === "Show Front")).toMatchObject({
    disabled: false,
  });
  expect(items.find((item) => item.label === "Unlock Front")).toMatchObject({
    disabled: false,
  });
  commands.updatePiece.run({
    id: "panel",
    patch: { visible: true, locked: false },
  });
  expect(useEditor.getState().document.pieces.panel).toMatchObject({
    visible: true,
    locked: false,
  });
});
