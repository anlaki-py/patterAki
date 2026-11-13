import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function state(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const s = (await import(path)).useEditor.getState();
    return { doc: s.document, past: s.past.length, status: s.saveStatus };
  });
}
async function file(page: Page, name: string) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function open(page: Page) {
  await file(page, "Reference images…");
  await expect(page.getByRole("dialog")).toBeVisible();
}
async function pick(page: Page, x: number, y: number) {
  const markers = await page
    .getByRole("img", { name: "Reference point picker" })
    .locator("circle")
    .count();
  await page
    .getByRole("img", { name: "Reference point picker" })
    .evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
  const point = await page
    .getByRole("img", { name: "Reference point picker" })
    .evaluate(
      (el, p) => {
        const svg = el as SVGSVGElement,
          point = svg.createSVGPoint();
        point.x = p.x;
        point.y = p.y;
        const screen = point.matrixTransform(svg.getScreenCTM()!);
        return { x: screen.x, y: screen.y };
      },
      { x, y },
    );
  const hit = await page.evaluate((p) => {
    const el = document.elementFromPoint(p.x, p.y);
    return {
      tag: el?.tagName,
      inside: !!el?.closest('[aria-label="Reference point picker"]'),
      point: p,
    };
  }, point);
  expect(hit.inside, JSON.stringify(hit)).toBe(true);
  await page.mouse.click(point.x, point.y);
  await expect(
    page.getByRole("img", { name: "Reference point picker" }).locator("circle"),
  ).toHaveCount(markers + 1);
}
async function importImage(page: Page) {
  await page
    .getByRole("dialog")
    .locator('input[type="file"]')
    .setInputFiles("public/icon-192.png");
  await expect(
    page.getByRole("img", { name: "Reference point picker" }),
  ).toBeVisible();
}
async function saved(page: Page) {
  await expect
    .poll(async () => (await state(page)).status)
    .toBe("Saved locally");
}

test("reference PNG calibration, lock, placement, tracing, cancel, undo and image backup survive reopening", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.goto("/");
  await expect(page.locator("svg.drafting-surface")).toBeVisible();
  await open(page);
  await importImage(page);
  await expect(
    page.getByRole("switch", { name: "Lock reference placement" }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Calibrate preview", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("switch", { name: "Lock reference placement" })
    .uncheck();
  await pick(page, 20, 96);
  await pick(page, 120, 96);
  for (const [label, value] of [
    ["Point 1 X (pixels)", "20"],
    ["Point 1 Y (pixels)", "96"],
    ["Point 2 X (pixels)", "120"],
    ["Point 2 Y (pixels)", "96"],
  ])
    await page.getByRole("textbox", { name: label, exact: true }).fill(value);
  await page
    .getByRole("textbox", { name: "Known distance (mm)", exact: true })
    .fill("100");
  await page
    .getByRole("button", { name: "Calibrate preview", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "X position (mm)", exact: true })
    .fill("10");
  await page
    .getByRole("textbox", { name: "Rotation (degrees)", exact: true })
    .fill("15");
  await page
    .getByRole("button", { name: "Apply reference", exact: true })
    .click();
  let doc = (await state(page)).doc;
  const ref = Object.values(doc.references!)[0];
  expect(ref.mmPerPixel).toBeCloseTo(1, 8);
  expect(ref.rotation).toBe(15);
  expect(ref.x).toBe(10);
  expect(ref.calibration?.distanceMm).toBe(100);
  await expect(page.locator('[data-layer="references"] image')).toHaveCount(1);
  await open(page);
  await page
    .getByRole("textbox", { name: "X position (mm)", exact: true })
    .fill("99");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await state(page)).doc).toEqual(doc);
  // Trace the calibrated 100 px line using the existing line tool in world coordinates.
  await page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    (await import(path)).useEditor.setState({
      tool: "line",
      snap: false,
      showRulers: false,
    });
  });
  const group = page.locator("svg.drafting-surface > g[transform]");
  const coords = await group.evaluate((el) => {
    const p = (el as SVGGElement).ownerSVGElement!.createSVGPoint();
    const m = (el as SVGGElement).getScreenCTM()!;
    return [20, 120].map((x) => {
      p.x = x;
      p.y = 96;
      const v = p.matrixTransform(m);
      return { x: v.x, y: v.y };
    });
  });
  await page.mouse.click(coords[0].x, coords[0].y);
  await page.getByRole("textbox", { name: /Exact length/ }).fill("100 mm");
  await page
    .getByRole("textbox", { name: "Angle (degrees)", exact: true })
    .fill("15");
  await page.getByRole("textbox", { name: /Exact length/ }).press("Enter");
  doc = (await state(page)).doc;
  const line = Object.values(doc.segments)[0];
  expect(line.kind).toBe("line");
  expect(
    Math.hypot(
      doc.points[line.to].x - doc.points[line.from].x,
      doc.points[line.to].y - doc.points[line.from].y,
    ),
  ).toBeCloseTo(100, 8);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+s");
  await saved(page);
  const download = page.waitForEvent("download");
  await file(page, "Export editable JSON");
  const backup = JSON.parse(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(backup.format).toBe("patternaki-reference-backup");
  expect(backup.assets).toHaveLength(1);
  expect(backup.document.references[ref.id].assetId).toBe(ref.assetId);
  expect(JSON.stringify(backup.document)).not.toContain("base64");
  await page.reload();
  await expect(page.locator('[data-layer="references"] image')).toHaveCount(1);
  expect((await state(page)).doc).toEqual(doc);
  await open(page);
  await page
    .getByRole("button", { name: "Remove reference layer", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator('[data-layer="references"] image')).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(page.locator('[data-layer="references"] image')).toHaveCount(1);
  const imageDownload = page.waitForEvent("download");
  await open(page);
  await page
    .getByRole("button", { name: "Download original image", exact: true })
    .click();
  expect(await readFile((await (await imageDownload).path())!)).toEqual(
    await readFile("public/icon-192.png"),
  );
  await page.screenshot({ path: "test-results/reference-desktop.png" });
});

test("perspective correction resets scale, preserves original, rejects invalid corners and supports phone controls", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("svg.drafting-surface")).toBeVisible();
  await open(page);
  await importImage(page);
  const before = (await state(page)).doc;
  await page
    .getByRole("switch", { name: "Lock reference placement" })
    .uncheck();
  await page
    .getByRole("combobox", { name: "Image operation", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Four-corner perspective correction" })
    .click();
  for (const p of [
    [20, 20],
    [170, 170],
    [170, 20],
    [20, 170],
  ])
    await pick(page, ...(p as [number, number]));
  await page
    .getByRole("button", { name: "Correct perspective preview", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("convex");
  expect((await state(page)).doc).toEqual(before);
  await page.getByRole("button", { name: "Clear points", exact: true }).click();
  for (const p of [
    [20, 20],
    [170, 30],
    [160, 170],
    [30, 160],
  ])
    await pick(page, ...(p as [number, number]));
  await page
    .getByRole("button", { name: "Correct perspective preview", exact: true })
    .click();
  await expect(
    page.getByText("0 points selected.", { exact: false }),
  ).toBeVisible();
  await pick(page, 20, 96);
  await pick(page, 120, 96);
  await page
    .getByRole("textbox", { name: "Known distance (mm)", exact: true })
    .fill("100");
  await page
    .getByRole("button", { name: "Calibrate preview", exact: true })
    .click();
  await page.getByRole("switch", { name: "Lock reference placement" }).check();
  await page
    .getByRole("button", { name: "Apply reference", exact: true })
    .click();
  const ref = Object.values((await state(page)).doc.references!)[0];
  expect(ref.corners).toHaveLength(4);
  expect(ref.calibration?.distanceMm).toBe(100);
  expect(ref.locked).toBe(true);
  await open(page);
  await expect(
    page.getByRole("textbox", { name: "X position (mm)", exact: true }),
  ).toBeDisabled();
  await page.screenshot({ path: "test-results/reference-phone.png" });
});

test("invalid and quota-failed image imports preserve geometry; manufacturing SVG excludes bitmaps and review opts in", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.goto("/");
  await expect(page.locator("svg.drafting-surface")).toBeVisible();
  await page.evaluate(async () => {
    const a = "/src/editor/store.ts",
      b = "/src/document/operations.ts";
    const { useEditor } = await import(a),
      { addPath } = await import(b);
    let n = 0;
    useEditor.getState().commit(
      addPath(
        useEditor.getState().document,
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        true,
        () => `ref-piece-${++n}`,
      ),
    );
  });
  await page.evaluate(async () => {
    const a = "/src/document/pieces.ts",
      b = "/src/editor/store.ts";
    const { createPieceFromEdge } = await import(a),
      { useEditor } = await import(b);
    const doc = useEditor.getState().document;
    useEditor
      .getState()
      .commit(
        createPieceFromEdge(
          doc,
          Object.keys(doc.segments)[0],
          "review-panel",
          "Review panel",
        ),
      );
  });
  const before = (await state(page)).doc;
  await open(page);
  await page
    .getByRole("dialog")
    .locator('input[type="file"]')
    .setInputFiles({
      name: "bad.png",
      mimeType: "image/png",
      buffer: Buffer.from("not an image"),
    });
  await expect(page.getByRole("alert")).toContainText("contents do not match");
  expect((await state(page)).doc).toEqual(before);
  await page.evaluate(async () => {
    const path = "/src/persistence/database.ts";
    const { db } = await import(path);
    db.assets.hook("creating", () => {
      throw new DOMException("Image quota test", "QuotaExceededError");
    });
  });
  await page
    .getByRole("dialog")
    .locator('input[type="file"]')
    .setInputFiles("public/icon-192.png");
  await expect(page.getByRole("alert")).toContainText("quota");
  expect((await state(page)).doc).toEqual(before);
  await page.reload();
  await expect(page.locator("svg.drafting-surface")).toBeVisible();
  await open(page);
  await importImage(page);
  await page
    .getByRole("button", { name: "Apply reference", exact: true })
    .click();
  for (const review of [false, true]) {
    await file(page, "Export vector SVG…");
    if (review)
      await page
        .getByRole("checkbox", { name: "Reference underlay for review only" })
        .check();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download SVG", exact: true })
      .click();
    const text = await readFile((await (await download).path())!, "utf8");
    expect(text.includes("<image")).toBe(review);
    if (review) expect(text).toContain("data:image/png;base64,");
  }
});

test("JPEG original and calibrated backup restore in a fresh browser store; malformed bundles retain the active document", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  await page.goto("/");
  await expect(page.locator("svg.drafting-surface")).toBeVisible();
  const encoded = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 200;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 400, 200);
    ctx.fillStyle = "black";
    ctx.fillRect(20, 90, 100, 2);
    return c.toDataURL("image/jpeg").split(",")[1];
  });
  const jpeg = Buffer.from(encoded, "base64");
  await open(page);
  await page
    .getByRole("dialog")
    .locator("input[type=file]")
    .setInputFiles({ name: "ruler.jpg", mimeType: "image/jpeg", buffer: jpeg });
  await expect(
    page.getByRole("img", { name: "Reference point picker" }),
  ).toBeVisible();
  await page
    .getByRole("switch", { name: "Lock reference placement" })
    .uncheck();
  await pick(page, 20, 90);
  await pick(page, 120, 90);
  for (const [label, value] of [
    ["Point 1 X (pixels)", "20"],
    ["Point 1 Y (pixels)", "90"],
    ["Point 2 X (pixels)", "120"],
    ["Point 2 Y (pixels)", "90"],
  ])
    await page.getByRole("textbox", { name: label, exact: true }).fill(value);
  await page
    .getByRole("button", { name: "Calibrate preview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply reference", exact: true })
    .click();
  const pending = page.waitForEvent("download");
  await file(page, "Export editable JSON");
  const backup = await readFile((await (await pending).path())!);
  const fresh = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const restored = await fresh.newPage();
    await restored.goto("https://localhost:5173");
    await expect(restored.locator("svg.drafting-surface")).toBeVisible();
    await restored.locator("input[type=file]").setInputFiles({
      name: "ruler.json",
      mimeType: "application/json",
      buffer: backup,
    });
    await expect(restored.locator("[data-layer=references] image")).toHaveCount(
      1,
    );
    await saved(restored);
    const doc = (await state(restored)).doc,
      ref = Object.values(doc.references!)[0];
    expect(ref.name).toBe("ruler.jpg");
    expect(ref.mmPerPixel).toBe(1);
    await open(restored);
    const original = restored.waitForEvent("download");
    await restored
      .getByRole("button", { name: "Download original image", exact: true })
      .click();
    expect(await readFile((await (await original).path())!)).toEqual(jpeg);
    await restored.getByRole("button", { name: "Cancel", exact: true }).click();
    const invalid = JSON.parse(backup.toString());
    invalid.assets[0].base64 = btoa("corrupt");
    await restored.locator("input[type=file]").setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(invalid)),
    });
    await expect(
      restored.getByText("Import failed", { exact: true }),
    ).toBeVisible();
    expect((await state(restored)).doc).toEqual(doc);
  } finally {
    await fresh.close();
  }
});
