import { test, expect, type Page } from "@playwright/test";
async function state(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const { useEditor } = await import(path);
    const s = useEditor.getState();
    return {
      doc: s.document,
      preview: s.preview,
      past: s.past.length,
      issue: s.previewIssue,
    };
  });
}
async function seed(page: Page) {
  await page.goto("/");
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const path = "/src/editor/store.ts";
        const { useEditor } = await import(path);
        return useEditor.getState().ready;
      }),
    )
    .toBe(true);
  await page.evaluate(async () => {
    const a = "/src/document/operations.ts",
      b = "/src/document/schema.ts",
      c = "/src/document/pieces.ts",
      d = "/src/editor/store.ts";
    const { addPath } = await import(a),
      { emptyDocument } = await import(b),
      { createPieceFromEdge } = await import(c),
      { useEditor } = await import(d);
    let n = 0;
    let doc = addPath(
      emptyDocument("m31-browser"),
      [
        { x: 20, y: 20 },
        { x: 200, y: 20 },
        { x: 200, y: 260 },
        { x: 20, y: 260 },
      ],
      true,
      () => `seam-${++n}`,
    );
    doc = createPieceFromEdge(
      doc,
      Object.keys(doc.segments)[0],
      "front",
      "Wallet",
    );
    useEditor.getState().load(doc);
    useEditor.setState({
      selected: Object.keys(doc.segments),
      showRulers: false,
      snap: false,
    });
  });
  const button = page.getByRole("button", { name: "Properties", exact: true });
  if ((await button.getAttribute("aria-expanded")) !== "true")
    await button.click();
}
test("M3.1 live seam preview, cancel, apply, joins, visibility, history and reopen", async ({
  page,
}) => {
  test.setTimeout(90000);
  await seed(page);
  const before = (await state(page)).doc;
  await page
    .getByRole("button", { name: "Seam allowance…", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Seam width (mm)", exact: true })
    .fill("5");
  await expect
    .poll(
      async () =>
        (await state(page)).preview?.pieces.front.seamAllowance?.widthMm,
    )
    .toBe(5);
  expect((await state(page)).doc).toEqual(before);
  await expect(page.locator('path[data-cut="front"]')).toHaveAttribute(
    "d",
    "M 15 15 L 205 15 L 205 265 L 15 265 Z",
  );
  await expect(page.locator("[data-seam-width]")).toContainText(
    "Allowance 0.5 cm",
  );
  await page.screenshot({ path: "/tmp/m31-offset-preview.png" });
  await page.keyboard.press("Escape");
  expect((await state(page)).doc).toEqual(before);
  expect((await state(page)).preview).toBeNull();
  await page
    .getByRole("button", { name: "Seam allowance…", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Seam width (mm)", exact: true })
    .fill("5");
  await page
    .getByRole("button", { name: "Apply seam allowance", exact: true })
    .click();
  expect((await state(page)).past).toBe(1);
  await page
    .getByRole("combobox", { name: "Outline visibility", exact: true })
    .click();
  await page.getByRole("option", { name: "Cut", exact: true }).click();
  await expect(page.locator('.edge-stroke[visibility="hidden"]')).toHaveCount(
    4,
  );
  await page
    .getByRole("combobox", { name: "Outline visibility", exact: true })
    .click();
  await page.getByRole("option", { name: "Stitch", exact: true }).click();
  await expect(page.locator("path[data-cut]")).toHaveCount(0);
  expect((await state(page)).past).toBe(1);
  await page
    .getByRole("combobox", { name: "Outline visibility", exact: true })
    .click();
  await page.getByRole("option", { name: "Both", exact: true }).click();
  await page
    .getByRole("button", { name: "Seam allowance…", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Corner join", exact: true })
    .click();
  await page.getByRole("option", { name: "round", exact: true }).click();
  await page
    .getByRole("button", { name: "Apply seam allowance", exact: true })
    .click();
  expect((await state(page)).past).toBe(2);
  await page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const { useEditor } = await import(path);
    useEditor.getState().undo();
  });
  expect((await state(page)).doc.pieces.front.seamAllowance?.join).toBe(
    "miter",
  );
  await page.evaluate(async () => {
    const a = "/src/editor/store.ts",
      b = "/src/persistence/projects.ts";
    const { useEditor } = await import(a),
      { saveProject } = await import(b);
    useEditor.getState().redo();
    await saveProject(useEditor.getState().document);
  });
  await page.reload();
  await expect
    .poll(async () => (await state(page)).doc.pieces.front?.seamAllowance?.join)
    .toBe("round");
  await expect(page.locator('path[data-cut="front"]')).toHaveCount(1);
  await page.screenshot({ path: "/tmp/m31-offset-desktop.png" });
});
test("M3.1 phone controls preview zero edge width and reject invalid inputs", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  await page
    .getByRole("button", { name: "Seam allowance…", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Seam width (mm)", exact: true })
    .fill("10");
  await page
    .getByRole("checkbox", { name: "Override edge width", exact: true })
    .check();
  await page
    .getByRole("textbox", { name: "Edge allowance (mm)", exact: true })
    .fill("0");
  await expect
    .poll(
      async () =>
        (await state(page)).preview?.pieces.front.sewing?.edges["seam-5"]
          ?.allowanceMm,
    )
    .toBe(0);
  await page
    .getByRole("textbox", { name: "Seam width (mm)", exact: true })
    .fill("");
  await expect(
    page.getByRole("button", { name: "Apply seam allowance", exact: true }),
  ).toBeDisabled();
  expect((await state(page)).past).toBe(0);
  await page
    .getByRole("textbox", { name: "Seam width (mm)", exact: true })
    .fill("10");
  await page
    .getByRole("button", { name: "Apply seam allowance", exact: true })
    .click();
  expect((await state(page)).past).toBe(1);
  await page.screenshot({ path: "/tmp/m31-offset-phone.png" });
});
test("M3.1 impossible offsets warn before commit and preserve the source", async ({
  page,
}) => {
  await seed(page);
  await page.evaluate(async () => {
    const a = "/src/document/operations.ts",
      b = "/src/document/schema.ts",
      c = "/src/document/pieces.ts",
      d = "/src/editor/store.ts";
    const { addPath } = await import(a),
      { emptyDocument } = await import(b),
      { createPieceFromEdge } = await import(c),
      { useEditor } = await import(d);
    let n = 0;
    let doc = addPath(
      emptyDocument("m31-invalid"),
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 60, y: 100 },
        { x: 60, y: 20 },
        { x: 40, y: 20 },
        { x: 40, y: 100 },
        { x: 0, y: 100 },
      ],
      true,
      () => `notch-${++n}`,
    );
    doc = createPieceFromEdge(
      doc,
      Object.keys(doc.segments)[0],
      "front",
      "Wallet",
    );
    useEditor.getState().load(doc);
    useEditor.setState({ selected: Object.keys(doc.segments) });
  });
  const before = (await state(page)).doc;
  await page
    .getByRole("button", { name: "Seam allowance…", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Seam width (mm)", exact: true })
    .fill("15");
  await expect(page.getByRole("alert")).toContainText("Cut outline");
  await expect(
    page.getByRole("button", { name: "Apply seam allowance", exact: true }),
  ).toBeDisabled();
  expect((await state(page)).doc).toEqual(before);
  expect((await state(page)).past).toBe(0);
  await page
    .getByRole("textbox", { name: "Seam width (mm)", exact: true })
    .fill("5");
  await page
    .getByRole("button", { name: "Apply seam allowance", exact: true })
    .click();
  expect((await state(page)).doc.points).toEqual(before.points);
  expect((await state(page)).doc.segments).toEqual(before.segments);
  expect((await state(page)).past).toBe(1);
});
