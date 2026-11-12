import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const { useEditor } = await import(path);
    const s = useEditor.getState();
    return { doc: s.document, past: s.past.length, preview: s.preview };
  });
}
async function seed(page: Page) {
  await page.goto("/");
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const path = "/src/editor/store.ts";
        return (await import(path)).useEditor.getState().ready;
      }),
    )
    .toBe(true);
  await page.evaluate(async () => {
    const a = "/src/document/operations.ts",
      b = "/src/document/schema.ts",
      c = "/src/document/pieces.ts",
      d = "/src/editor/store.ts",
      e = "/src/document/ellipse.ts",
      f = "/src/document/seamAllowance.ts",
      g = "/src/document/pieceTransforms.ts";
    const { addPath } = await import(a),
      { emptyDocument } = await import(b),
      { createPieceFromEdge } = await import(c),
      { useEditor } = await import(d),
      { addEllipse } = await import(e),
      { setSeamAllowance } = await import(f),
      { transformPieces, rotationAround } = await import(g);
    let n = 0;
    const id = () => `m32-${++n}`;
    let doc = addPath(
      emptyDocument("m32-browser"),
      [
        { x: 0, y: 0 },
        { x: 180, y: 0 },
        { x: 180, y: 240 },
        { x: 0, y: 240 },
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
    doc = setSeamAllowance(doc, "front", {
      widthMm: 5,
      join: "miter",
      miterLimit: 4,
    });
    doc = addEllipse(doc, 300, 40, 100, 80, id);
    const ellipse = Object.keys(doc.pieces).find((key) => key !== "front")!;
    doc = transformPieces(
      doc,
      [ellipse],
      rotationAround(30, { x: 350, y: 80 }),
    );
    doc.annotations.label = {
      id: "label",
      kind: "text",
      position: { x: 20, y: 30 },
      rotation: 15,
      fontSizeMm: 4,
      text: '<script>alert("x")</script> & linen',
    };
    useEditor.getState().load(doc);
    useEditor.setState({
      selected: doc.pieces.front.stitchingOutline.map((r) => r.segmentId),
      showRulers: false,
    });
  });
}
async function openExport(page: Page) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Export vector SVG…", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Download SVG", exact: true }),
  ).toBeVisible();
}
async function download(page: Page) {
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download SVG", exact: true }).click();
  const result = await waiting;
  return {
    name: result.suggestedFilename(),
    svg: await readFile((await result.path())!, "utf8"),
  };
}

test("M3.2 selected and all-piece downloads open as standalone physical vector SVG", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  await seed(page);
  const before = await snapshot(page);
  await openExport(page);
  await page
    .getByRole("checkbox", { name: "Piece metadata", exact: true })
    .uncheck();
  const selected = await download(page);
  expect(selected.name).toBe("Wallet.svg");
  expect(selected.svg).toContain(
    'width="210mm" height="270mm" viewBox="-15 -15 210 270"',
  );
  expect(selected.svg.match(/data-piece=/g)).toHaveLength(1);
  expect(selected.svg).not.toContain("data-annotation");
  expect(await snapshot(page)).toEqual(before);
  const surface = page.locator("svg.drafting-surface");
  const transform = await surface
    .locator("g[transform]")
    .first()
    .getAttribute("transform");
  await surface.hover();
  await page.mouse.wheel(0, 500);
  await expect(surface.locator("g[transform]").first()).not.toHaveAttribute(
    "transform",
    transform!,
  );
  await page.keyboard.down("Space");
  await page.mouse.move(600, 400);
  await page.mouse.down();
  await page.mouse.move(650, 430, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  await openExport(page);
  await page
    .getByRole("checkbox", { name: "Piece metadata", exact: true })
    .uncheck();
  expect((await download(page)).svg).toBe(selected.svg);
  expect(await snapshot(page)).toEqual(before);
  await openExport(page);
  await page
    .getByRole("combobox", { name: "Export scope", exact: true })
    .click();
  await page
    .getByRole("option", { name: "All visible pieces", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Piece metadata", exact: true })
    .uncheck();
  const all = await download(page);
  expect(all.svg.match(/data-piece=/g)).toHaveLength(2);
  expect(all.svg).toContain(" C ");
  expect(all.svg).toContain(
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; linen",
  );
  expect(all.svg).not.toMatch(
    /snap|handle|selection|<script|<image|<foreignObject/,
  );
  expect(await snapshot(page)).toEqual(before);
  // Serve only the downloaded bytes, with no app, imports or editor stylesheet.
  const viewer = await context.newPage();
  await viewer.setViewportSize({ width: 1800, height: 1200 });
  await viewer.route("**/standalone.svg", (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: all.svg }),
  );
  await viewer.goto("https://localhost:5173/standalone.svg");
  await expect(viewer.locator("parsererror")).toHaveCount(0);
  await expect(viewer.locator("svg")).toBeVisible();
  await expect(viewer.locator("text")).toHaveText(
    '<script>alert("x")</script> & linen',
  );
  const measured = await viewer.locator("svg").evaluate((node) => {
    const svg = node as SVGSVGElement;
    const box = svg.viewBox.baseVal;
    const bounds = svg.querySelector("g")!.getBBox();
    return {
      scale: svg.width.baseVal.value / box.width,
      paths: [...svg.querySelectorAll("path")].map((p) => p.getTotalLength()),
      scripts: svg.querySelectorAll("script, image, foreignObject").length,
      textFill: getComputedStyle(svg.querySelector("text")!).fill,
      bbox: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      },
      viewBox: { x: box.x, y: box.y, width: box.width, height: box.height },
    };
  });
  expect(measured.scale).toBeCloseTo(96 / 25.4, 5);
  expect(measured.paths.every((length) => length > 0)).toBe(true);
  expect(measured.scripts).toBe(0);
  expect(measured.textFill).toBe("rgb(0, 0, 0)");
  expect(measured.bbox.x).toBeGreaterThanOrEqual(measured.viewBox.x);
  expect(measured.bbox.y).toBeGreaterThanOrEqual(measured.viewBox.y);
  expect(measured.bbox.x + measured.bbox.width).toBeLessThan(
    measured.viewBox.x + measured.viewBox.width,
  );
  expect(measured.bbox.y + measured.bbox.height).toBeLessThan(
    measured.viewBox.y + measured.viewBox.height,
  );
  await viewer.screenshot({ path: "/tmp/m32-svg-viewer.png" });
  await viewer.close();
});

test("M3.2 phone export toggles layers, rejects empty output and cancels without editing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  const before = await snapshot(page);
  await openExport(page);
  for (const name of [
    "Cut outlines",
    "Stitch outlines",
    "Sewing marks and labels",
    "Internal construction paths",
    "Piece metadata",
  ])
    await page.getByRole("checkbox", { name, exact: true }).uncheck();
  await expect(
    page.getByRole("button", { name: "Download SVG", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "Stitch outlines", exact: true })
    .check();
  await page.screenshot({ path: "/tmp/m32-svg-phone.png" });
  const result = await download(page);
  expect(result.svg).toContain('width="200mm" height="260mm"');
  expect(result.svg).toContain('data-layer="stitch"');
  expect(result.svg).not.toContain('data-layer="cut"');
  expect(result.svg).not.toContain('data-layer="marks"');
  await openExport(page);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await snapshot(page)).toEqual(before);
});

test("M3.2 download failure is visible and preserves geometry and undo history", async ({
  page,
}) => {
  await seed(page);
  const before = await snapshot(page);
  await openExport(page);
  await page.evaluate(() => {
    URL.createObjectURL = () => {
      throw new Error("Download unavailable");
    };
  });
  await page.getByRole("button", { name: "Download SVG", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Download unavailable");
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    (await import(path)).useEditor.setState({ hasDraft: true });
  });
  await openExport(page);
  await expect(
    page.getByRole("button", { name: "Download SVG", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Finish or cancel the active edit before exporting."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await snapshot(page)).toEqual(before);
});
