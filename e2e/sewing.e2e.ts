import { expect, test, type Page } from "@playwright/test";
async function seed(page: Page) {
  await page.goto("/");
  await expect(page.locator("svg.drafting-surface")).toBeVisible();
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
    const id = () => `m22-${++n}`;
    let doc = addPath(
      emptyDocument("m22-browser"),
      [
        { x: 20, y: 20 },
        { x: 200, y: 20 },
        { x: 200, y: 260 },
        { x: 20, y: 260 },
      ],
      true,
      id,
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
      ready: true,
      showRulers: false,
      snap: false,
    });
  });
  if (
    (await page
      .getByRole("button", { name: "Properties", exact: true })
      .getAttribute("aria-expanded")) !== "true"
  )
    await page.getByRole("button", { name: "Properties", exact: true }).click();
  await page
    .getByRole("button", { name: "Sewing roles and marks", exact: true })
    .click();
}
async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const { useEditor } = await import(path);
    const s = useEditor.getState();
    return { doc: s.document, preview: s.preview, past: s.past.length };
  });
}
test("M2.2 attached sewing edits preview, cancel, undo, reopen, export and unfold", async ({
  page,
}) => {
  test.setTimeout(90000);
  await seed(page);
  await page.getByRole("button", { name: "Add notch", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Distance from A (mm)", exact: true })
    .fill("30");
  await expect
    .poll(
      async () =>
        (await snapshot(page)).preview?.pieces.front.sewing?.notches[0]
          .fraction,
    )
    .toBeCloseTo(30 / 180);
  expect((await snapshot(page)).doc.pieces.front.sewing).toBeUndefined();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await snapshot(page)).doc.pieces.front.sewing).toBeUndefined();
  await page.getByRole("button", { name: "Add notch", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Distance from A (mm)", exact: true })
    .fill("30");
  await page
    .getByRole("textbox", { name: "Distance from A (mm)", exact: true })
    .press("Enter");
  expect((await snapshot(page)).past).toBe(1);
  await page.getByRole("button", { name: "Add dart", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Local X (mm)", exact: true })
    .fill("100");
  await page
    .getByRole("textbox", { name: "Local Y (mm)", exact: true })
    .fill("50");
  await page
    .getByRole("button", { name: "Apply sewing edit", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add attached grainline", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply sewing edit", exact: true })
    .click();
  await expect(page.locator("path[data-sewing]")).toHaveCount(3);
  await page
    .getByRole("combobox", { name: "Sewing edge", exact: true })
    .click();
  await page.getByRole("option").last().click();
  await page.getByRole("combobox", { name: "Edge role", exact: true }).click();
  await page.getByRole("option", { name: "On fold", exact: true }).click();
  await expect(
    page.getByText("Default fold allowance: 0 mm", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add attached fold mark", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Attach mark to edge", exact: true })
    .click();
  await page.getByRole("option").last().click();
  await page
    .getByRole("button", { name: "Apply sewing edit", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export sewing SVG", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("Wallet.svg");
  const committed = (await snapshot(page)).doc;
  await page.evaluate(async (doc) => {
    const path = "/src/persistence/projects.ts";
    const { saveProject } = await import(path);
    await saveProject(doc);
  }, committed);
  await page.reload();
  await expect
    .poll(
      async () =>
        (await snapshot(page)).doc.pieces.front?.sewing?.notches.length,
    )
    .toBe(1);
  if (
    (await page
      .getByRole("button", { name: "Properties", exact: true })
      .getAttribute("aria-expanded")) !== "true"
  )
    await page.getByRole("button", { name: "Properties", exact: true }).click();
  await page.getByRole("button", { name: "Wallet", exact: true }).click();
  await page
    .getByRole("button", { name: "Sewing roles and marks", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Sewing edge", exact: true })
    .click();
  await page.getByRole("option").last().click();
  await page
    .getByRole("button", { name: "Unfold across fold edge", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await snapshot(page)).doc.pieces.front.stitchingOutline.length,
    )
    .toBe(6);
  expect((await snapshot(page)).doc.pieces.front.sewing?.notches).toHaveLength(
    2,
  );
  await page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const { useEditor } = await import(path);
    useEditor.getState().undo();
  });
  expect((await snapshot(page)).doc.pieces.front.stitchingOutline).toHaveLength(
    4,
  );
  await page.screenshot({ path: "/tmp/m22-sewing-desktop.png" });
});
test("M2.2 ellipse numerical shape preview is cancellable and commits editable cubics", async ({
  page,
}) => {
  await seed(page);
  const before = (await snapshot(page)).doc;
  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await page.getByRole("menuitem", { name: "Ellipse…", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Ellipse width (mm)", exact: true })
    .fill("120");
  await page
    .getByRole("textbox", { name: "Ellipse height (mm)", exact: true })
    .fill("80");
  await expect
    .poll(
      async () =>
        Object.keys((await snapshot(page)).preview?.pieces ?? {}).length,
    )
    .toBe(2);
  await page.keyboard.press("Escape");
  expect((await snapshot(page)).doc).toEqual(before);
  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await page.getByRole("menuitem", { name: "Ellipse…", exact: true }).click();
  await page
    .getByRole("button", { name: "Apply sewing edit", exact: true })
    .click();
  expect(Object.keys((await snapshot(page)).doc.pieces)).toHaveLength(2);
});
test("M2.2 internal role visibility, invalid dart and legacy attachment work in the phone drawer", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  await page.evaluate(async () => {
    const a = "/src/editor/store.ts",
      b = "/src/document/operations.ts",
      c = "/src/document/piecePathsEdit.ts";
    const { useEditor } = await import(a),
      { addPath } = await import(b),
      { attachInternalPath } = await import(c);
    const s = useEditor.getState();
    let n = 0;
    let doc = addPath(
      s.document,
      [
        { x: 40, y: 60 },
        { x: 100, y: 80 },
      ],
      false,
      () => `phone-internal-${++n}`,
    );
    const edges = Object.keys(doc.segments).filter(
      (key) => !s.document.segments[key],
    );
    doc = attachInternalPath(doc, "front", edges, "phone-path");
    s.commit(doc);
  });
  await page
    .getByRole("combobox", { name: "Internal path 1 role", exact: true })
    .click();
  await page.getByRole("option", { name: "placement", exact: true }).click();
  await expect(page.locator('path[data-role="placement"]')).toHaveCount(1);
  await page
    .getByRole("checkbox", { name: "Show internal path 1", exact: true })
    .uncheck();
  await expect(page.locator('path[data-role="placement"]')).toHaveCount(0);
  expect(
    (await snapshot(page)).doc.pieces.front.sewing?.paths["phone-path"],
  ).toEqual({ role: "placement", visible: false, export: true });
  await page.getByRole("button", { name: "Add dart", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Intake (mm)", exact: true })
    .fill("0");
  await expect(
    page.getByRole("button", { name: "Apply sewing edit", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  expect((await snapshot(page)).doc.pieces.front.sewing?.darts).toHaveLength(0);
  await expect(
    page.getByRole("dialog", { name: "Pattern properties", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const a = "/src/editor/store.ts",
      b = "/src/document/annotations.ts";
    const { useEditor } = await import(a),
      { newAnnotation, putAnnotation } = await import(b);
    const s = useEditor.getState();
    const mark = {
      ...newAnnotation("grainline", { x: 50, y: 60 }, "phone-grain"),
      label: "Linen warp",
    };
    s.commit(putAnnotation(s.document, mark));
    useEditor.setState({ selected: [mark.id] });
  });
  await page
    .getByRole("combobox", { name: "Sewing mark parent", exact: true })
    .click();
  await page.getByRole("option", { name: "Wallet", exact: true }).click();
  await page
    .getByRole("button", { name: "Sewing roles and marks", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Attach selected legacy mark", exact: true })
    .click();
  const saved = (await snapshot(page)).doc;
  expect(saved.annotations["phone-grain"]).toBeUndefined();
  expect(saved.pieces.front.sewing?.marks[0].label).toBe("Linen warp");
  await page.getByRole("button", { name: "Wallet", exact: true }).click();
  await page
    .getByRole("button", { name: "Sewing roles and marks", exact: true })
    .click();
  await page.screenshot({ path: "/tmp/m22-sewing-phone.png" });
});
