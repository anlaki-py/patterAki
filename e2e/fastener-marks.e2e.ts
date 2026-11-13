import { expect, test, type Page } from "@playwright/test";

test.setTimeout(120_000);
async function seed(page: Page) {
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = "/src/editor/store.ts";
        return (await import(path)).useEditor.getState().ready;
      }),
    )
    .toBe(true);
  await page.evaluate(async () => {
    const store = "/src/editor/store.ts",
      schema = "/src/document/schema.ts";
    const { useEditor } = await import(store),
      { emptyDocument } = await import(schema);
    useEditor
      .getState()
      .load({ ...emptyDocument("browser-fasteners"), unitsDisplay: "mm" });
    useEditor.setState({
      tool: "select",
      selected: [],
      snap: false,
      showRulers: false,
    });
  });
  const box = (await page.locator("svg.drafting-surface").boundingBox())!;
  await page.mouse.move(box.x + 180, box.y + 160);
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const s = (await import(path)).useEditor.getState();
    return { doc: s.document, preview: s.preview, past: s.past.length };
  });
}
async function add(page: Page, name: string) {
  await page.getByRole("button", { name: "Marks", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
async function choose(page: Page, name: string, option: string) {
  await page.getByRole("combobox", { name, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
async function fill(page: Page, name: string, value: string) {
  await page.getByRole("textbox", { name, exact: true }).fill(value);
}
async function apply(page: Page) {
  await page.getByRole("button", { name: "Apply mark", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("custom button dimensions and holes preview, edit, undo/redo and survive reload", async ({
  page,
}) => {
  await seed(page);
  await add(page, "Button…");
  await choose(page, "Button shape", "Rectangle");
  await fill(page, "Button width (mm)", "24");
  await fill(page, "Button height (mm)", "16");
  await choose(page, "Button holes", "Two holes");
  await fill(page, "Hole diameter (mm)", "2");
  await fill(page, "Hole center spacing (mm)", "6");
  const preview = await state(page);
  expect(preview.doc.annotations).toEqual({});
  expect(preview.past).toBe(0);
  expect(Object.values(preview.preview!.annotations)[0]).toMatchObject({
    kind: "button",
    shape: "rectangle",
    widthMm: 24,
    heightMm: 16,
    holes: "two",
    holeDiameterMm: 2,
    holeSpacingMm: 6,
  });
  await apply(page);
  const committed = await state(page);
  expect(committed.past).toBe(1);
  await expect(
    page.locator("[data-annotation] circle.annotation-stroke"),
  ).toHaveCount(2);
  await page
    .locator('[data-annotation] circle[fill="transparent"]')
    .first()
    .dblclick();
  await expect(page.getByRole("dialog")).toBeVisible();
  await fill(page, "Button width (mm)", "1");
  await expect(page.getByRole("alert")).toContainText("fit inside");
  await expect(
    page.getByRole("button", { name: "Apply mark", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await state(page)).doc).toEqual(committed.doc);
  await page.locator("svg.drafting-surface").focus();
  await page.keyboard.press("Control+z");
  expect((await state(page)).doc.annotations).toEqual({});
  await page.keyboard.press("Control+Shift+z");
  expect((await state(page)).doc).toEqual(committed.doc);
  await page.keyboard.press("Control+s");
  await expect(page.getByRole("status")).toContainText("Saved locally");
  await page.reload();
  await expect.poll(async () => (await state(page)).doc).toEqual(committed.doc);
});

test("all buttonhole variants support exact slit and oval-eye dimensions with cancellation", async ({
  page,
}) => {
  await seed(page);
  for (const style of ["Straight", "Rounded ends", "Jeans / keyhole"]) {
    await add(page, "Buttonhole…");
    await choose(page, "Buttonhole style", style);
    await fill(page, "Overall buttonhole length (mm)", "30");
    await fill(page, "Slit width (mm)", "2");
    if (style === "Jeans / keyhole") {
      await fill(page, "Eye length (mm)", "6");
      await fill(page, "Eye width (mm)", "5");
      await fill(page, "Angle (degrees clockwise)", "90");
      await page.screenshot({ path: "test-results/keyhole-mark-dialog.png" });
    }
    await apply(page);
  }
  const committed = await state(page),
    marks = Object.values(committed.doc.annotations);
  expect(marks).toHaveLength(3);
  expect(committed.past).toBe(3);
  expect(marks[2]).toMatchObject({
    kind: "buttonhole",
    style: "keyhole",
    lengthMm: 30,
    widthMm: 2,
    eyeLengthMm: 6,
    eyeWidthMm: 5,
    rotation: 90,
  });
  await page.getByRole("button", { name: "Marks", exact: true }).click();
  await page.getByRole("menuitem", { name: /Edit mark/ }).click();
  await fill(page, "Eye width (mm)", "1");
  await expect(page.getByRole("alert")).toContainText("eye must be wider");
  await expect(
    page.getByRole("button", { name: "Apply mark", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await state(page)).doc).toEqual(committed.doc);
  expect((await state(page)).past).toBe(3);
});

test("eyelet, snap and bar tack are customizable through phone controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  await add(page, "Eyelet…");
  await fill(page, "Outer diameter (mm)", "10");
  await fill(page, "Opening diameter (mm)", "5");
  await apply(page);
  await add(page, "Snap fastener…");
  await fill(page, "Outer diameter (mm)", "14");
  await fill(page, "Center diameter (mm)", "6");
  await apply(page);
  await add(page, "Bar tack…");
  await fill(page, "Bar-tack length (mm)", "12");
  await fill(page, "Bar-tack width (mm)", "3");
  await fill(page, "Stitch count", "10");
  await page.screenshot({ path: "test-results/bartack-phone-dialog.png" });
  await apply(page);
  await add(page, "Button…");
  await fill(page, "Button width (mm)", "20");
  await fill(page, "Button height (mm)", "20");
  await expect(
    page.getByRole("button", { name: "Apply mark", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const committed = await state(page);
  expect(Object.values(committed.doc.annotations)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "eyelet", diameterMm: 10, openingMm: 5 }),
      expect.objectContaining({ kind: "snap", diameterMm: 14, openingMm: 6 }),
      expect.objectContaining({
        kind: "bartack",
        lengthMm: 12,
        widthMm: 3,
        stitches: 10,
      }),
    ]),
  );
  expect(committed.past).toBe(3);
  expect(committed.doc.points).toEqual({});
  expect(committed.doc.segments).toEqual({});
});
