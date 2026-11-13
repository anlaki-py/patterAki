import { expect, test, type Page } from "@playwright/test";

test.setTimeout(120_000);

async function seed(page: Page) {
  await page.goto("/");
  await expect(page.locator("svg.drafting-surface")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = "/src/editor/store.ts";
        const { useEditor } = await import(path);
        return useEditor.getState().ready;
      }),
    )
    .toBe(true);
  await page.evaluate(async () => {
    const store = "/src/editor/store.ts",
      schema = "/src/document/schema.ts",
      operations = "/src/document/operations.ts";
    const { useEditor } = await import(store),
      { emptyDocument } = await import(schema),
      { addPath } = await import(operations);
    let sequence = 0;
    const doc = addPath(
      emptyDocument("browser-merge-lines"),
      [
        { x: 50, y: 60 },
        { x: 100, y: 60 },
        { x: 150, y: 60 },
        { x: 200, y: 60 },
      ],
      false,
      () => `merge-${++sequence}`,
    );
    useEditor.getState().load(doc);
    useEditor.setState({
      tool: "select",
      selected: [],
      snap: false,
      showRulers: false,
    });
  });
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const { useEditor } = await import(path),
      s = useEditor.getState();
    return { doc: s.document, selected: s.selected, past: s.past.length };
  });
}
async function clickEdge(
  page: Page,
  id: string,
  options: { shift?: boolean; right?: boolean } = {},
) {
  const point = await page
    .locator(`[data-edge="${id}"]`)
    .evaluate((element) => {
      const path = element as SVGPathElement;
      const p = path.getPointAtLength(path.getTotalLength() / 2);
      const screen = new DOMPoint(p.x, p.y).matrixTransform(
        path.getScreenCTM()!,
      );
      return { x: screen.x, y: screen.y };
    });
  if (options.shift) await page.keyboard.down("Shift");
  await page.mouse.click(point.x, point.y, {
    button: options.right ? "right" : "left",
  });
  if (options.shift) await page.keyboard.up("Shift");
}
async function menu(page: Page) {
  await page.getByRole("button", { name: "Edge actions", exact: true }).click();
  return page.getByRole("menuitem", {
    name: "Merge lines and remove points",
    exact: true,
  });
}
for (const count of [2, 3])
  test(`Shift-select ${count} lines, merge, undo/redo and reload`, async ({
    page,
  }) => {
    await seed(page);
    const original = await state(page),
      ids = Object.keys(original.doc.segments);
    for (let i = 0; i < count; i++)
      await clickEdge(page, ids[i], { shift: i > 0 });
    expect((await state(page)).selected).toHaveLength(count);
    await (await menu(page)).click();
    const merged = await state(page);
    expect(Object.keys(merged.doc.segments)).toHaveLength(4 - count);
    expect(Object.keys(merged.doc.points)).toHaveLength(5 - count);
    expect(merged.past).toBe(1);
    expect(merged.selected).toEqual([ids[0]]);
    await page.locator("svg.drafting-surface").focus();
    await page.keyboard.press("Control+z");
    expect((await state(page)).doc).toEqual(original.doc);
    await page.keyboard.press("Control+Shift+z");
    expect((await state(page)).doc).toEqual(merged.doc);
    await page.keyboard.press("Control+s");
    await expect(
      page.getByRole("status").filter({ hasText: "Saved locally" }),
    ).toBeVisible();
    await page.reload();
    await expect(page.locator("svg.drafting-surface")).toBeVisible();
    await expect.poll(async () => (await state(page)).doc).toEqual(merged.doc);
  });
test("right-click keeps the group; disconnected selection reports an error without losing geometry", async ({
  page,
}) => {
  await seed(page);
  const original = await state(page),
    ids = Object.keys(original.doc.segments);
  await clickEdge(page, ids[0]);
  await clickEdge(page, ids[2], { shift: true });
  await clickEdge(page, ids[0], { right: true });
  await page
    .getByRole("menuitem", {
      name: "Merge lines and remove points",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Select one connected, open chain without branches.", {
      exact: true,
    }),
  ).toBeVisible();
  expect((await state(page)).doc).toEqual(original.doc);
  expect((await state(page)).past).toBe(0);
  await clickEdge(page, ids[1], { shift: true });
  await clickEdge(page, ids[1], { right: true });
  await page
    .getByRole("menuitem", {
      name: "Merge lines and remove points",
      exact: true,
    })
    .click();
  expect(Object.keys((await state(page)).doc.segments)).toHaveLength(1);
});

test("box selection merges without keyboard modifiers on a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 1000 });
  await seed(page);
  const bounds = await page.locator("[data-edge]").evaluateAll((edges) => {
    const boxes = edges.map((edge) => edge.getBoundingClientRect());
    return {
      left: Math.min(...boxes.map((b) => b.left)),
      right: Math.max(...boxes.map((b) => b.right)),
      top: Math.min(...boxes.map((b) => b.top)),
      bottom: Math.max(...boxes.map((b) => b.bottom)),
    };
  });
  await page.mouse.move(bounds.left - 20, bounds.top - 25);
  await page.mouse.down();
  await page.mouse.move(bounds.right + 20, bounds.bottom + 25, { steps: 8 });
  await page.mouse.up();
  expect((await state(page)).selected).toHaveLength(3);
  await (await menu(page)).click();
  expect(Object.keys((await state(page)).doc.points)).toHaveLength(2);
});
