import { expect, test, type Page } from "@playwright/test";

async function seed(page: Page, piece = true, recoveries = 0) {
  await page.goto("/");
  await expect(page.locator("svg.drafting-surface")).toBeVisible();
  await page.evaluate(
    async ({ piece, recoveries }) => {
      const storePath = "/src/editor/store.ts",
        schemaPath = "/src/document/schema.ts",
        piecesPath = "/src/document/pieces.ts",
        operationsPath = "/src/document/operations.ts",
        transformsPath = "/src/document/pieceTransforms.ts";
      const { useEditor } = await import(storePath),
        { emptyDocument } = await import(schemaPath),
        { createPieceFromEdge, pieceEdges } = await import(piecesPath),
        { addPath } = await import(operationsPath),
        { duplicatePieces } = await import(transformsPath);
      let count = 0;
      const id = () => `browser-piece-${++count}`;
      let doc = addPath(
        emptyDocument("browser-piece-actions"),
        [
          { x: 30, y: 30 },
          { x: 130, y: 30 },
          { x: 130, y: 110 },
          { x: 30, y: 110 },
        ],
        true,
        id,
      );
      doc.unitsDisplay = "mm";
      const first = Object.keys(doc.segments)[0];
      if (piece) doc = createPieceFromEdge(doc, first, "panel", "Front");
      for (let i = 1; i <= recoveries; i++) {
        const result = duplicatePieces(doc, ["panel"], id, {
          x: 200 * i,
          y: 0,
        });
        doc = result.document;
        const copied = result.pieceIds[0];
        doc.pieces[copied] = {
          ...doc.pieces[copied],
          name: `Recovery ${i}`,
          locked: true,
          visible: false,
        };
      }
      useEditor.getState().load(doc);
      useEditor.setState({
        tool: "select",
        selected: piece ? pieceEdges(doc, doc.pieces.panel) : [first],
        activePoint: null,
        snap: false,
        showRulers: false,
      });
    },
    { piece, recoveries },
  );
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const { useEditor } = await import(path);
    const s = useEditor.getState();
    return {
      doc: s.document,
      past: s.past.length,
      preview: s.preview,
      selected: s.selected,
      editPieceId: s.editPieceId,
    };
  });
}
async function openPieces(page: Page) {
  await page
    .getByRole("button", { name: "Piece actions", exact: true })
    .click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  return menu;
}
async function expectInsideViewport(page: Page) {
  const menu = page.getByRole("menu");
  await expect
    .poll(async () => {
      const box = await menu.boundingBox(),
        viewport = page.viewportSize()!;
      return (
        !!box &&
        box.y >= 7 &&
        box.y + box.height <= viewport.height - 7 &&
        box.x >= 0 &&
        box.x + box.width <= viewport.width
      );
    })
    .toBe(true);
  return menu;
}

test("named conversion enables piece options; rename, rotate preview, cancel, Enter and undo/redo work through menus", async ({
  page,
}) => {
  await seed(page, false);
  const original = (await state(page)).doc;
  let menu = await openPieces(page);
  await expect(
    menu.getByRole("menuitem", { name: "Create piece from closed path…" }),
  ).toBeEnabled();
  await menu
    .getByRole("menuitem", { name: "Create piece from closed path…" })
    .click();
  await page
    .getByRole("textbox", { name: "Piece name", exact: true })
    .fill("Front panel");
  expect((await state(page)).doc.pieces).toEqual({});
  await page.getByRole("button", { name: "Create piece", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await state(page)).past).toBe(1);
  expect((await state(page)).doc.points).toEqual(original.points);
  menu = await openPieces(page);
  for (const name of [
    "Rename piece…",
    "Rotate selected pieces…",
    "Duplicate pieces",
    "Mirror left/right",
    "Mirror top/bottom",
    "Lock selected pieces",
    "Hide selected pieces",
  ])
    await expect(
      menu.getByRole("menuitem", { name, exact: true }),
    ).toBeEnabled();
  await menu
    .getByRole("menuitem", { name: "Rename piece…", exact: true })
    .click();
  const name = page.getByRole("textbox", { name: "Piece name", exact: true });
  await name.fill("Renamed front");
  await name.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const renamed = (await state(page)).doc;
  expect(Object.values(renamed.pieces)[0].name).toBe("Renamed front");
  menu = await openPieces(page);
  await menu
    .getByRole("menuitem", { name: "Rotate selected pieces…", exact: true })
    .click();
  const angle = page.getByLabel("Clockwise rotation in degrees", {
    exact: true,
  });
  await angle.fill("90");
  await expect
    .poll(async () => (await state(page)).preview !== null)
    .toBe(true);
  expect((await state(page)).doc).toEqual(renamed);
  await angle.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await state(page)).doc).toEqual(renamed);
  expect((await state(page)).preview).toBeNull();
  menu = await openPieces(page);
  await menu
    .getByRole("menuitem", { name: "Rotate selected pieces…", exact: true })
    .click();
  await angle.fill("90");
  await angle.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const rotated = await state(page);
  expect(rotated.past).toBe(3);
  expect(Object.values(rotated.doc.pieces)[0].transform.b).toBeCloseTo(1, 10);
  await page.locator("svg.drafting-surface").focus();
  await page.keyboard.press("Control+z");
  expect((await state(page)).doc).toEqual(renamed);
  await page.keyboard.press("Control+Shift+z");
  expect((await state(page)).doc).toEqual(rotated.doc);
});

test("selecting an individual piece edge keeps rename/rotate/duplicate enabled", async ({
  page,
}) => {
  await seed(page);
  const canvas = page.locator("svg.drafting-surface");
  await canvas.focus();
  await page.keyboard.press("e");
  expect((await state(page)).selected).toHaveLength(1);
  expect((await state(page)).editPieceId).toBe("panel");
  const menu = await openPieces(page);
  for (const name of [
    "Rename piece…",
    "Rotate selected pieces…",
    "Duplicate pieces",
  ])
    await expect(
      menu.getByRole("menuitem", { name, exact: true }),
    ).toBeEnabled();
  await menu
    .getByRole("menuitem", { name: "Rotate selected pieces…", exact: true })
    .click();
  await page
    .getByLabel("Clockwise rotation in degrees", { exact: true })
    .fill("30");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await state(page)).past).toBe(0);
  expect((await state(page)).preview).toBeNull();
});

test("a long right-click menu fits the viewport before scrolling and exposes its last recovery action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 480 });
  await seed(page, true, 18);
  const fill = page.locator('svg path[data-edge][stroke="none"]');
  await fill.click({ button: "right" });
  const menu = await expectInsideViewport(page);
  const bounds = (await menu.boundingBox())!;
  expect(bounds.height).toBeGreaterThan(420);
  const before = await menu.evaluate((element) => ({
    height: element.clientHeight,
    scroll: element.scrollHeight,
    top: element.scrollTop,
  }));
  expect(before.scroll).toBeGreaterThan(before.height);
  await page.screenshot({ path: "test-results/piece-menu-desktop.png" });
  await menu.hover();
  await page.mouse.wheel(0, 1200);
  await expect
    .poll(() => menu.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(before.top);
  const last = menu.getByRole("menuitem", {
    name: "Show Recovery 18",
    exact: true,
  });
  await last.scrollIntoViewIfNeeded();
  await last.click();
  await expect
    .poll(
      async () =>
        Object.values((await state(page)).doc.pieces).find(
          (p) => p.name === "Recovery 18",
        )?.visible,
    )
    .toBe(true);
  expect((await state(page)).past).toBe(1);
});

test.describe("touch piece menu", () => {
  test.use({
    viewport: { width: 390, height: 700 },
    hasTouch: true,
    isMobile: true,
  });
  test("the toolbar menu fits a phone, scrolls, and rename works without Properties", async ({
    page,
  }) => {
    await seed(page, true, 12);
    await page
      .getByRole("button", { name: "Piece actions", exact: true })
      .tap();
    const menu = await expectInsideViewport(page);
    const scroll = await menu.evaluate((element) => ({
      height: element.clientHeight,
      scroll: element.scrollHeight,
    }));
    expect(scroll.scroll).toBeGreaterThan(scroll.height);
    await page.screenshot({ path: "test-results/piece-menu-phone.png" });
    await menu
      .getByRole("menuitem", { name: "Rename piece…", exact: true })
      .tap();
    const name = page.getByRole("textbox", { name: "Piece name", exact: true });
    await name.fill("Phone front");
    await page.getByRole("button", { name: "Rename piece", exact: true }).tap();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await state(page)).doc.pieces.panel.name).toBe("Phone front");
  });
});

test("Line placement stays straight after pointer drift on both anchors", async ({
  page,
}) => {
  await seed(page, false);
  const canvas = page.locator("svg.drafting-surface");
  await canvas.focus();
  await page.keyboard.press("l");
  const box = (await canvas.boundingBox())!;
  const start = { x: box.x + 360, y: box.y + 180 },
    end = { x: box.x + 560, y: box.y + 180 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 8, start.y + 5);
  await page.mouse.up();
  await page.mouse.move(end.x, end.y);
  await page.mouse.down();
  await page.mouse.move(end.x + 8, end.y - 5);
  await page.mouse.up();
  const current = await state(page);
  expect(current.past).toBe(1);
  expect(
    Object.values(current.doc.segments).every((edge) => edge.kind === "line"),
  ).toBe(true);
});

test("a rectangle drawn with real UI converts when generated IDs make the outline traverse its first edge backward", async ({
  page,
}) => {
  await seed(page, false);
  await page.evaluate(async () => {
    const storePath = "/src/editor/store.ts",
      schemaPath = "/src/document/schema.ts";
    const { useEditor } = await import(storePath),
      { emptyDocument } = await import(schemaPath);
    const doc = emptyDocument("drawn-rectangle-order");
    doc.unitsDisplay = "mm";
    useEditor.getState().load(doc);
    const ids = [
      "z-origin",
      "a-top-right",
      "m-bottom-right",
      "n-bottom-left",
      "a-edge",
      "z-edge",
      "y-edge",
      "x-edge",
      "browser-panel",
    ];
    let index = 0;
    Object.defineProperty(crypto, "randomUUID", {
      configurable: true,
      value: () => ids[index++] ?? `extra-${index}`,
    });
  });
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  const canvas = page.locator("svg.drafting-surface"),
    box = (await canvas.boundingBox())!;
  const origin = { x: box.x + 180, y: box.y + 160 };
  await page.mouse.click(origin.x, origin.y);
  await page
    .getByRole("textbox", { name: "Width (mm)", exact: true })
    .fill("100 mm");
  await page
    .getByRole("textbox", { name: "Height (mm)", exact: true })
    .fill("80 mm");
  await page
    .getByRole("button", { name: "Create rectangle", exact: true })
    .click();
  const drawn = (await state(page)).doc;
  expect(Object.keys(drawn.segments)).toEqual([
    "a-edge",
    "z-edge",
    "y-edge",
    "x-edge",
  ]);
  await canvas.focus();
  await page.keyboard.press("v");
  await page.mouse.click(origin.x + 100, origin.y);
  const menu = await openPieces(page);
  await menu
    .getByRole("menuitem", {
      name: "Create piece from closed path…",
      exact: true,
    })
    .click();
  await page
    .getByRole("textbox", { name: "Piece name", exact: true })
    .fill("Rectangle panel");
  await page.getByRole("button", { name: "Create piece", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const converted = await state(page);
  expect(converted.doc.pieces["browser-panel"].name).toBe("Rectangle panel");
  expect(converted.doc.pieces["browser-panel"].stitchingOutline).toHaveLength(
    4,
  );
  expect(converted.doc.points).toEqual(drawn.points);
  expect(converted.doc.segments).toEqual(drawn.segments);
  expect(converted.past).toBe(2);
  await canvas.focus();
  await page.keyboard.press("Control+z");
  expect((await state(page)).doc).toEqual(drawn);
  await page.keyboard.press("Control+Shift+z");
  expect((await state(page)).doc).toEqual(converted.doc);
});
