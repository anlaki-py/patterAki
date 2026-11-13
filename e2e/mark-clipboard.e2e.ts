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
    const a = "/src/editor/store.ts",
      b = "/src/document/schema.ts",
      c = "/src/document/annotations.ts",
      d = "/src/document/operations.ts";
    const { useEditor } = await import(a),
      { emptyDocument } = await import(b),
      { newAnnotation, putAnnotation } = await import(c),
      { addPath } = await import(d);
    let sequence = 0;
    let doc = addPath(
      emptyDocument("browser-mark-clipboard"),
      [
        { x: 0, y: 180 },
        { x: 180, y: 180 },
      ],
      false,
      () => `geometry-${++sequence}`,
    );
    const button = newAnnotation("button", { x: 60, y: 60 }, "button");
    const hole = newAnnotation("buttonhole", { x: 110, y: 60 }, "hole");
    if (button.kind !== "button" || hole.kind !== "buttonhole")
      throw new Error("Wrong fixture kind");
    doc = putAnnotation(doc, {
      ...button,
      widthMm: 20,
      heightMm: 16,
      holes: "two",
      rotation: 30,
    });
    doc = putAnnotation(doc, {
      ...hole,
      style: "keyhole",
      lengthMm: 24,
      widthMm: 2,
      eyeLengthMm: 6,
      eyeWidthMm: 5,
      rotation: 90,
    });
    doc = putAnnotation(doc, {
      ...newAnnotation("text", { x: 40, y: 110 }, "text"),
      kind: "text",
      text: "Button placement",
      fontSizeMm: 5,
    });
    useEditor.getState().load(doc);
    useEditor.setState({
      tool: "select",
      selected: [],
      snap: false,
      showRulers: false,
      markClipboard: null,
    });
  });
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const s = (await import(path)).useEditor.getState();
    return {
      doc: s.document,
      past: s.past.length,
      selected: s.selected,
      clipboard: s.markClipboard,
    };
  });
}
async function clickMark(
  page: Page,
  id: string,
  options: { right?: boolean; shift?: boolean } = {},
) {
  const point = await page
    .locator(`[data-annotation="${id}"]`)
    .evaluate((element) => {
      const p = new DOMPoint(0, 0).matrixTransform(
        (element as SVGGraphicsElement).getScreenCTM()!,
      );
      return { x: p.x, y: p.y };
    });
  if (options.shift) await page.keyboard.down("Shift");
  await page.mouse.click(point.x, point.y, {
    button: options.right ? "right" : "left",
  });
  if (options.shift) await page.keyboard.up("Shift");
}
async function action(page: Page, name: string) {
  await page.getByRole("menuitem", { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
}
async function toolbar(page: Page, name: string) {
  await page.getByRole("button", { name: "Marks", exact: true }).click();
  await action(page, name);
}

test("click, Ctrl+C and Ctrl+V preserve mark dimensions, select the paste and support undo/reload", async ({
  page,
}) => {
  await seed(page);
  const before = await state(page);
  await clickMark(page, "button");
  expect((await state(page)).selected).toEqual(["button"]);
  await page.keyboard.press("Control+c");
  expect((await state(page)).past).toBe(0);
  await page.keyboard.press("Control+v");
  const pasted = await state(page),
    id = pasted.selected[0];
  expect(id).not.toBe("button");
  expect(pasted.doc.annotations[id]).toEqual({
    ...before.doc.annotations.button,
    id,
    position: { x: 70, y: 70 },
  });
  expect(pasted.past).toBe(1);
  expect(pasted.doc.points).toEqual(before.doc.points);
  expect(pasted.doc.segments).toEqual(before.doc.segments);
  await page.keyboard.press("Control+z");
  expect((await state(page)).doc).toEqual(before.doc);
  await page.keyboard.press("Control+Shift+z");
  expect((await state(page)).doc).toEqual(pasted.doc);
  await page.keyboard.press("Control+v");
  const again = await state(page);
  expect(again.doc.annotations[again.selected[0]].position).toEqual({
    x: 80,
    y: 80,
  });
  await page.keyboard.press("Control+s");
  await expect(page.getByRole("status")).toContainText("Saved locally");
  await page.reload();
  await expect.poll(async () => (await state(page)).doc).toEqual(again.doc);
  expect((await state(page)).clipboard).toBeNull();
});

test("right-click Copy and Duplicate retain keyhole settings and Paste here uses the clicked location", async ({
  page,
}) => {
  await seed(page);
  const before = await state(page);
  await clickMark(page, "hole", { right: true });
  await action(page, "Copy marks");
  expect((await state(page)).past).toBe(0);
  await clickMark(page, "hole", { right: true });
  await action(page, "Duplicate marks");
  const duplicate = await state(page),
    id = duplicate.selected[0];
  expect(duplicate.doc.annotations[id]).toEqual({
    ...before.doc.annotations.hole,
    id,
    position: { x: 120, y: 70 },
  });
  const location = await page
    .locator("svg.drafting-surface > g[transform]")
    .evaluate((element) => {
      const p = new DOMPoint(240, 130).matrixTransform(
        (element as SVGGraphicsElement).getScreenCTM()!,
      );
      return { x: p.x, y: p.y };
    });
  await page.mouse.click(location.x, location.y, { button: "right" });
  await action(page, "Paste marks here");
  const pasted = await state(page),
    newId = pasted.selected[0];
  expect(pasted.doc.annotations[newId]).toMatchObject({
    kind: "buttonhole",
    style: "keyhole",
    lengthMm: 24,
    widthMm: 2,
    eyeLengthMm: 6,
    eyeWidthMm: 5,
    rotation: 90,
    position: { x: 240, y: 130 },
  });
  expect(pasted.past).toBe(2);
  expect(pasted.clipboard?.marks[0].id).toBe("hole");
});

test("Shift-selected marks cut, paste and duplicate as groups with one undo entry per action", async ({
  page,
}) => {
  await seed(page);
  const before = await state(page);
  await clickMark(page, "button");
  await clickMark(page, "hole", { shift: true });
  expect((await state(page)).selected).toEqual(["button", "hole"]);
  await page.keyboard.press("Control+x");
  expect(Object.keys((await state(page)).doc.annotations)).toEqual(["text"]);
  expect((await state(page)).past).toBe(1);
  await page.keyboard.press("Control+v");
  const pasted = await state(page);
  expect(pasted.selected).toHaveLength(2);
  expect(pasted.doc.annotations[pasted.selected[0]].position).toEqual({
    x: 70,
    y: 70,
  });
  expect(pasted.doc.annotations[pasted.selected[1]].position).toEqual({
    x: 120,
    y: 70,
  });
  await page.keyboard.press("Control+d");
  expect((await state(page)).past).toBe(3);
  expect(Object.keys((await state(page)).doc.annotations)).toHaveLength(5);
  await page.keyboard.press("Control+z");
  expect((await state(page)).doc).toEqual(pasted.doc);
  expect((await state(page)).doc.points).toEqual(before.doc.points);
  expect((await state(page)).doc.segments).toEqual(before.doc.segments);
});

test("phone Marks menu duplicates and pastes without keyboard or right-click", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  await clickMark(page, "button");
  await toolbar(page, "Copy marks");
  await toolbar(page, "Duplicate marks");
  await toolbar(page, "Paste marks");
  const s = await state(page);
  expect(s.past).toBe(2);
  expect(
    Object.values(s.doc.annotations).filter((m) => m.kind === "button"),
  ).toHaveLength(3);
  expect(s.doc.annotations[s.selected[0]].position).toEqual({ x: 80, y: 80 });
  await page.getByRole("button", { name: "Marks", exact: true }).click();
  await page.screenshot({ path: "test-results/mark-clipboard-phone.png" });
  await expect(
    page.getByRole("menuitem", { name: /^Copy marks/ }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
});

test("text fields retain native copy/paste and do not replace the mark clipboard", async ({
  page,
}) => {
  await seed(page);
  await clickMark(page, "button");
  await page.keyboard.press("Control+c");
  const clipboard = (await state(page)).clipboard;
  await clickMark(page, "text");
  await page.getByRole("button", { name: "Marks", exact: true }).click();
  await action(page, "Edit mark");
  const input = page.getByRole("textbox", { name: "Text", exact: true });
  await input.fill("Copy this label");
  await input.press("Control+a");
  await input.press("Control+c");
  await input.fill("");
  await input.press("Control+v");
  await expect(input).toHaveValue("Copy this label");
  expect((await state(page)).clipboard).toEqual(clipboard);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.locator("svg.drafting-surface").focus();
  await page.keyboard.press("Control+v");
  const s = await state(page);
  expect(s.doc.annotations[s.selected[0]].kind).toBe("button");
  expect(s.past).toBe(1);
});
