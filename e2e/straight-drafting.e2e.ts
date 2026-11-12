import { expect, test, type Page } from "@playwright/test";

async function seed(page: Page) {
  await page.goto("/");
  await expect(page.locator("svg.drafting-surface")).toBeVisible();
  await page.evaluate(async () => {
    const storePath = "/src/editor/store.ts",
      schemaPath = "/src/document/schema.ts";
    const { useEditor } = await import(storePath),
      { emptyDocument } = await import(schemaPath);
    const doc = emptyDocument("straight-drafting");
    doc.unitsDisplay = "mm";
    useEditor.getState().load(doc);
    useEditor.setState({
      tool: "polyline",
      selected: [],
      snap: false,
      showRulers: false,
    });
  });
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const { useEditor } = await import(path);
    const s = useEditor.getState();
    return {
      doc: s.document,
      past: s.past.length,
      hasDraft: s.hasDraft,
      preview: s.preview,
    };
  });
}
async function anchorWithDrift(page: Page, x: number, y: number) {
  const box = (await page.locator("svg.drafting-surface").boundingBox())!;
  await page.mouse.move(box.x + x, box.y + y);
  await page.mouse.down();
  await page.mouse.move(box.x + x + 8, box.y + y + 5, { steps: 4 });
  await page.mouse.up();
}
for (const closed of [false, true])
  test(`Polyline ${closed ? "close" : "Finish"} keeps every placed segment straight despite anchor drift`, async ({
    page,
  }) => {
    await seed(page);
    await anchorWithDrift(page, 140, 140);
    await anchorWithDrift(page, 340, 140);
    await anchorWithDrift(page, 340, 300);
    await expect(page.locator("path.draft-line")).not.toHaveAttribute("d", /C/);
    expect((await state(page)).past).toBe(0);
    if (closed) await anchorWithDrift(page, 140, 140);
    else
      await page
        .getByRole("button", { name: "Finish line", exact: true })
        .click();
    const committed = await state(page);
    expect(committed.past).toBe(1);
    expect(Object.values(committed.doc.segments)).toHaveLength(closed ? 3 : 2);
    expect(
      Object.values(committed.doc.segments).every(
        (edge) => edge.kind === "line",
      ),
    ).toBe(true);
    expect(
      Object.values(committed.doc.points).every(
        (point) => !point.mode || point.mode === "corner",
      ),
    ).toBe(true);
    expect(committed.preview).toBeNull();
    await page.locator("svg.drafting-surface").focus();
    await page.keyboard.press("Control+z");
    expect(Object.keys((await state(page)).doc.segments)).toHaveLength(0);
    await page.keyboard.press("Control+Shift+z");
    expect((await state(page)).doc).toEqual(committed.doc);
  });

test("exact Polyline dimensions stay straight after anchor drift and cancel leaves no curved state", async ({
  page,
}) => {
  await seed(page);
  await anchorWithDrift(page, 140, 140);
  await page.locator("svg.drafting-surface").focus();
  await page.keyboard.press("Escape");
  expect((await state(page)).hasDraft).toBe(false);
  expect((await state(page)).past).toBe(0);
  await anchorWithDrift(page, 140, 140);
  const length = page.getByRole("textbox", {
    name: "Exact length (mm)",
    exact: true,
  });
  const angle = page.getByRole("textbox", {
    name: "Angle (degrees)",
    exact: true,
  });
  await length.fill("100 mm");
  await angle.fill("0");
  await length.press("Enter");
  await length.fill("80 mm");
  await angle.fill("90");
  await length.press("Enter");
  await page.getByRole("button", { name: "Finish line", exact: true }).click();
  const committed = await state(page),
    edges = Object.values(committed.doc.segments);
  expect(committed.past).toBe(1);
  expect(edges).toHaveLength(2);
  expect(edges.every((edge) => edge.kind === "line")).toBe(true);
  const lengths = edges.map((edge) => {
    const a = committed.doc.points[edge.from],
      b = committed.doc.points[edge.to];
    return Math.hypot(b.x - a.x, b.y - a.y);
  });
  expect(lengths[0]).toBeCloseTo(100, 8);
  expect(lengths[1]).toBeCloseTo(80, 8);
});

test("Curve still deliberately bends a previously placed straight Polyline edge", async ({
  page,
}) => {
  await seed(page);
  await anchorWithDrift(page, 140, 140);
  await anchorWithDrift(page, 340, 140);
  await page.getByRole("button", { name: "Finish line", exact: true }).click();
  expect(Object.values((await state(page)).doc.segments)[0].kind).toBe("line");
  const canvas = page.locator("svg.drafting-surface");
  await canvas.focus();
  await page.keyboard.press("c");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 240, box.y + 140);
  await page.mouse.down();
  await page.mouse.move(box.x + 240, box.y + 180, { steps: 6 });
  await page.mouse.up();
  expect(Object.values((await state(page)).doc.segments)[0].kind).toBe("cubic");
  expect((await state(page)).past).toBe(2);
});

test.describe("touch Polyline placement", () => {
  test.use({ viewport: { width: 800, height: 1000 }, hasTouch: true });
  test("finger movement while placing anchors does not create curves", async ({
    page,
  }) => {
    await seed(page);
    const session = await page.context().newCDPSession(page);
    for (const [x, y] of [
      [140, 140],
      [340, 140],
      [340, 300],
    ]) {
      const box = (await page.locator("svg.drafting-surface").boundingBox())!;
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: box.x + x, y: box.y + y }],
      });
      for (let i = 1; i <= 4; i++)
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: box.x + x + 2 * i, y: box.y + y + i }],
        });
      await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    }
    await page.getByRole("button", { name: "Finish line", exact: true }).tap();
    const committed = await state(page);
    expect(committed.past).toBe(1);
    expect(Object.values(committed.doc.segments)).toHaveLength(2);
    expect(
      Object.values(committed.doc.segments).every(
        (edge) => edge.kind === "line",
      ),
    ).toBe(true);
  });
});
