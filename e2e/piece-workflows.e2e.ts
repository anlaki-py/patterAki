import { expect, test, type Page } from "@playwright/test";
import type { PatternDocument } from "../src/document/schema";

async function seed(page: Page, internal = false) {
  await page.goto("/");
  await expect(page.locator("svg.drafting-surface")).toBeVisible();
  await page.evaluate(async (internal) => {
    const storePath = "/src/editor/store.ts",
      schemaPath = "/src/document/schema.ts",
      operationsPath = "/src/document/operations.ts",
      piecesPath = "/src/document/pieces.ts";
    const { useEditor } = await import(storePath),
      { emptyDocument } = await import(schemaPath),
      { addPath } = await import(operationsPath),
      { createPieceFromEdge } = await import(piecesPath);
    let n = 0;
    const id = () => `acceptance-${++n}`;
    let doc = emptyDocument("m21-browser-acceptance");
    doc.name = "M2.1 browser acceptance";
    doc.unitsDisplay = "mm";
    for (const [pieceId, x, y] of [
      ["front", 20, 20],
      ["back", 160, 30],
    ] as const) {
      const previous = new Set(Object.keys(doc.segments));
      doc = addPath(
        doc,
        [
          { x, y },
          { x: x + 80, y },
          { x: x + 80, y: y + 60 },
          { x, y: y + 60 },
        ],
        true,
        id,
      );
      const root = Object.keys(doc.segments).find(
        (edge) => !previous.has(edge),
      )!;
      doc = createPieceFromEdge(
        doc,
        root,
        pieceId,
        pieceId === "front" ? "Front" : "Back",
      );
    }
    if (internal)
      doc = addPath(
        doc,
        [
          { x: 40, y: 40 },
          { x: 80, y: 50 },
        ],
        false,
        id,
      );
    useEditor.getState().load(doc);
    useEditor.setState({
      tool: "select",
      selected: [],
      snap: false,
      grid: false,
      showRulers: false,
      lengthAnchor: "start",
    });
  }, internal);
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const { useEditor } = await import(path);
    const s = useEditor.getState();
    return {
      doc: s.document as PatternDocument,
      preview: s.preview as PatternDocument | null,
      selected: s.selected as string[],
      past: s.past.length as number,
      editPieceId: s.editPieceId as string | null,
    };
  });
}
async function point(page: Page, x: number, y: number) {
  return page.locator("svg.drafting-surface > g[transform]").evaluate(
    (element, p) => {
      const matrix = (element as SVGGElement).getScreenCTM()!;
      const result = new DOMPoint(p.x, p.y).matrixTransform(matrix);
      return { x: result.x, y: result.y };
    },
    { x, y },
  );
}
async function clickWorld(page: Page, x: number, y: number) {
  const p = await point(page, x, y);
  await page.mouse.click(p.x, p.y);
}
async function dragWorld(
  page: Page,
  from: [number, number],
  to: [number, number],
) {
  const a = await point(page, ...from),
    b = await point(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}
async function pieceAction(page: Page, name: string) {
  await page
    .getByRole("button", { name: "Piece actions", exact: true })
    .first()
    .click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function fileAction(page: Page, name: string) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function showProperties(page: Page) {
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await expect(page.locator("aside.inspector")).toBeVisible();
}
async function undo(page: Page) {
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.locator("svg.drafting-surface").focus();
  await page.keyboard.press("Control+z");
}

test("Shift/box selection, group drag, numeric move, shared rotation and fit preserve both pieces", async ({
  page,
}) => {
  await seed(page);
  const original = (await state(page)).doc;
  await clickWorld(page, 60, 65);
  await page.keyboard.down("Shift");
  await clickWorld(page, 200, 75);
  await page.keyboard.up("Shift");
  expect((await state(page)).selected).toHaveLength(8);
  await dragWorld(page, [60, 65], [75, 70]);
  const moved = await state(page);
  expect(moved.past).toBe(1);
  for (const [id, p] of Object.entries(original.points)) {
    expect(moved.doc.points[id].x).toBeCloseTo(p.x + 15, 6);
    expect(moved.doc.points[id].y).toBeCloseTo(p.y + 5, 6);
  }
  await undo(page);
  expect((await state(page)).doc).toEqual(original);
  await dragWorld(page, [10, 10], [250, 100]);
  expect((await state(page)).selected).toHaveLength(8);
  await showProperties(page);
  await expect(page.locator("aside.inspector")).toContainText(
    "2 pieces selected",
  );
  await expect(page.locator("aside.inspector")).toContainText("Width 220 mm");
  await expect(
    page.getByRole("button", { name: "Save piece properties", exact: true }),
  ).toHaveCount(0);
  await pieceAction(page, "Move…");
  await page
    .getByRole("textbox", { name: "ΔX (mm)", exact: true })
    .fill("-12.5 mm");
  await page
    .getByRole("textbox", { name: "ΔY (mm)", exact: true })
    .fill("7 mm");
  expect((await state(page)).doc).toEqual(original);
  await page.getByRole("button", { name: "Apply move", exact: true }).click();
  expect((await state(page)).past).toBe(1);
  await undo(page);
  await dragWorld(page, [10, 10], [250, 100]);
  await pieceAction(page, "Rotate selected pieces…");
  await page
    .getByLabel("Clockwise rotation in degrees", { exact: true })
    .fill("90");
  await expect(page.locator("aside.inspector")).toContainText(
    "Front · Rotation 90°",
  );
  await expect(page.locator("aside.inspector")).toContainText(
    "Back · Rotation 90°",
  );
  expect((await state(page)).doc).toEqual(original);
  await page
    .getByRole("button", { name: "Apply rotation", exact: true })
    .click();
  const rotated = (await state(page)).doc;
  for (const [id, p] of Object.entries(original.points)) {
    expect(rotated.points[id].x).toBeCloseTo(130 - (p.y - 55), 6);
    expect(rotated.points[id].y).toBeCloseTo(55 + (p.x - 130), 6);
  }
  await page
    .getByRole("button", { name: "Fit selection · F", exact: true })
    .click();
  expect((await state(page)).doc).toEqual(rotated);
  await page.screenshot({ path: "test-results/m21-multi-piece.png" });
});

test("duplicate, both mirrors, lock/hide and recovery work through the piece menu", async ({
  page,
}) => {
  await seed(page);
  await clickWorld(page, 60, 65);
  const original = (await state(page)).doc;
  await pieceAction(page, "Duplicate pieces");
  const copied = (await state(page)).doc;
  const copy = Object.values(copied.pieces).find(
    (p) => p.name === "Front copy",
  )!;
  expect(Object.keys(copied.pieces)).toHaveLength(3);
  expect((await state(page)).past).toBe(1);
  for (const name of ["Mirror left/right", "Mirror top/bottom"]) {
    await pieceAction(page, name);
    const frame = (await state(page)).doc.pieces[copy.id].transform;
    expect(frame.a * frame.d - frame.b * frame.c).toBeCloseTo(-1);
    await undo(page);
    expect((await state(page)).doc).toEqual(copied);
    const p = await point(page, 70, 75);
    await page.mouse.click(p.x, p.y);
  }
  await pieceAction(page, "Lock selected pieces");
  expect((await state(page)).doc.pieces[copy.id].locked).toBe(true);
  expect((await state(page)).selected).toHaveLength(0);
  await expect(
    page.locator(`svg path[data-edge="${copy.rootSegmentId}"]`),
  ).toHaveCount(0);
  await pieceAction(page, "Unlock Front copy");
  await clickWorld(page, 70, 75);
  await pieceAction(page, "Hide selected pieces");
  expect((await state(page)).doc.pieces[copy.id].visible).toBe(false);
  await expect(
    page.locator(`svg path[data-edge="${copy.rootSegmentId}"]`),
  ).toHaveCount(0);
  await pieceAction(page, "Show Front copy");
  expect((await state(page)).doc).toEqual(copied);
  for (const [id, p] of Object.entries(original.points))
    expect(copied.points[id]).toEqual(p);
});

test("internal-path attachment, whole-parent movement and save/open preserve geometry and metadata", async ({
  page,
}) => {
  // Includes editing, an IndexedDB project switch and a full page reload.
  test.setTimeout(60000);
  await seed(page, true);
  await showProperties(page);
  await clickWorld(page, 60, 45);
  const original = (await state(page)).doc;
  const parent = page.getByRole("combobox", {
    name: "Internal path parent",
    exact: true,
  });
  await parent.click();
  await page.getByRole("option", { name: "Front", exact: true }).click();
  await page
    .getByRole("button", { name: "Attach selected loose path", exact: true })
    .click();
  const attached = await state(page);
  expect(attached.doc.pieces.front.internalPaths).toHaveLength(1);
  expect(attached.selected).toHaveLength(5);
  expect(attached.past).toBe(1);
  expect(attached.doc.points).toEqual(original.points);
  await page
    .getByRole("textbox", { name: "Piece name", exact: true })
    .fill("Linen front");
  await page
    .getByRole("textbox", { name: "Fabric", exact: true })
    .fill("Linen");
  await page
    .getByRole("button", { name: "Save piece properties", exact: true })
    .click();
  await pieceAction(page, "Move…");
  await page
    .getByRole("textbox", { name: "ΔX (mm)", exact: true })
    .fill("10 mm");
  await page.getByRole("button", { name: "Apply move", exact: true }).click();
  const saved = (await state(page)).doc;
  const internal = saved.pieces.front.internalPaths[0].edges[0].segmentId;
  expect(saved.points[saved.segments[internal].from].x).toBe(50);
  expect(saved.pieces.front.metadata.fabric).toBe("Linen");
  await fileAction(page, "Save locally · Ctrl/Cmd+S");
  await expect(page.getByRole("status")).toContainText("Saved locally");
  await fileAction(page, "New project");
  await expect.poll(async () => (await state(page)).doc.id).not.toBe(saved.id);
  await fileAction(page, "Open saved project…");
  const row = page
    .getByRole("dialog")
    .getByText("M2.1 browser acceptance", { exact: true })
    .locator("../..");
  await row.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await state(page)).doc).toEqual(saved);
  await expect(page.getByRole("status")).toContainText("Saved locally");
  await page.reload();
  await expect.poll(async () => (await state(page)).doc.id).toBe(saved.id);
  expect((await state(page)).doc).toEqual(saved);
});

for (const zoom of [0.25, 1, 4]) {
  test(`inspector shared-point reshaping and dialog preview/cancel at ${zoom * 100}% zoom`, async ({
    page,
  }) => {
    await seed(page);
    await showProperties(page);
    await clickWorld(page, 60, 65);
    const original = (await state(page)).doc;
    const canvas = page.locator("svg.drafting-surface");
    await canvas.focus();
    const center = await point(page, 60, 50),
      box = (await canvas.boundingBox())!;
    await page.keyboard.down("Space");
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
      steps: 3,
    });
    await page.mouse.up();
    await page.keyboard.up("Space");
    expect((await state(page)).doc).toEqual(original);
    expect((await state(page)).past).toBe(0);
    await page.mouse.wheel(0, -Math.log(zoom) * 1000);
    await expect(page.locator(".workspace-controls")).toContainText(
      `${zoom * 100}%`,
    );
    await page
      .getByRole("button", { name: "Edit points · E", exact: true })
      .click();
    expect((await state(page)).editPieceId).toBe("front");
    const edge = original.segments[original.pieces.front.rootSegmentId];
    const length = page.getByRole("textbox", {
      name: "Length (mm)",
      exact: true,
    });
    await length.fill("100 mm");
    expect((await state(page)).doc).toEqual(original);
    await page
      .getByRole("button", { name: "Apply length", exact: true })
      .click();
    const edited = await state(page);
    expect(edited.past).toBe(1);
    expect(edited.doc.points[edge.to].x).toBe(120);
    expect(edited.doc.pieces.front.stitchingOutline).toEqual(
      original.pieces.front.stitchingOutline,
    );
    expect(edited.editPieceId).toBe("front");
    await pieceAction(page, "Rotate selected pieces…");
    const angle = page.getByLabel("Clockwise rotation in degrees", {
      exact: true,
    });
    await angle.fill("37");
    await expect(page.locator("aside.inspector")).toContainText("Rotation 37°");
    const handle = page.getByRole("button", {
      name: "Move rotate selected pieces window. Drag or use arrow keys.",
      exact: true,
    });
    const before = (await page.getByRole("dialog").boundingBox())!,
      grip = (await handle.boundingBox())!;
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      grip.x + grip.width / 2 + 60,
      grip.y + grip.height / 2 + 30,
      { steps: 3 },
    );
    await page.mouse.up();
    expect((await page.getByRole("dialog").boundingBox())!.x).toBeGreaterThan(
      before.x + 50,
    );
    expect((await state(page)).doc).toEqual(edited.doc);
    await page.screenshot({
      path: `test-results/m21-inspector-${zoom * 100}.png`,
    });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    expect((await state(page)).preview).toBeNull();
    expect((await state(page)).doc).toEqual(edited.doc);
    await undo(page);
    expect((await state(page)).doc).toEqual(original);
  });
}
