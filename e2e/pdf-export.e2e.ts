import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
const pt = 72 / 25.4;
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
    const a = "/src/document/schema.ts",
      b = "/src/document/operations.ts",
      c = "/src/document/pieces.ts",
      d = "/src/document/seamAllowance.ts",
      e = "/src/editor/store.ts";
    const { emptyDocument } = await import(a),
      { addPath } = await import(b),
      { createPieceFromEdge } = await import(c),
      { setSeamAllowance } = await import(d),
      { useEditor } = await import(e);
    let n = 0;
    let doc = addPath(
      emptyDocument("m33-browser"),
      [
        { x: 0, y: 0 },
        { x: 180, y: 0 },
        { x: 180, y: 240 },
        { x: 0, y: 240 },
      ],
      true,
      () => `m33-${++n}`,
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
    useEditor.getState().load(doc);
    useEditor.setState({
      selected: Object.keys(doc.segments),
      showRulers: false,
    });
  });
}
async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const s = (await import(path)).useEditor.getState();
    return { doc: s.document, past: s.past.length, preview: s.preview };
  });
}
async function open(page: Page) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Export actual-size PDF…", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Download PDF", exact: true }),
  ).toBeVisible();
}
async function download(page: Page) {
  const waiting = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const file = await waiting;
  return {
    name: file.suggestedFilename(),
    bytes: await readFile((await file.path())!),
  };
}
test("M3.3 wallet gate downloads exact A4 tiles and stays independent of zoom, theme and display units", async ({
  page,
}) => {
  test.setTimeout(90000);
  await seed(page);
  const before = await snapshot(page);
  await open(page);
  await page
    .getByRole("checkbox", { name: "Piece metadata", exact: true })
    .uncheck();
  const first = await download(page);
  expect(first.name).toBe("Wallet.pdf");
  const pdf = await PDFDocument.load(first.bytes);
  expect(pdf.getPageCount()).toBe(3);
  expect(pdf.getPage(0).getSize()).toEqual({
    width: 210 * pt,
    height: 297 * pt,
  });
  await page.locator("svg.drafting-surface").hover();
  await page.mouse.wheel(0, 700);
  await page
    .getByRole("button", { name: "Toggle color scheme", exact: true })
    .click();
  await page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const { useEditor } = await import(path);
    useEditor.setState((s) => ({
      document: { ...s.document, unitsDisplay: "in" },
    }));
  });
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  await open(page);
  await page
    .getByRole("checkbox", { name: "Piece metadata", exact: true })
    .uncheck();
  expect((await download(page)).bytes.equals(first.bytes)).toBe(true);
  const after = await snapshot(page);
  expect(after.doc.points).toEqual(before.doc.points);
  expect(after.doc.segments).toEqual(before.doc.segments);
  expect(after.past).toBe(before.past);
  await open(page);
  await page
    .getByRole("combobox", { name: "Paper layout", exact: true })
    .click();
  await page
    .getByRole("option", { name: "One large sheet", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Paper orientation", exact: true })
    .click();
  await page.getByRole("option", { name: "Landscape", exact: true }).click();
  await page.screenshot({ path: "/tmp/m33-pdf-desktop.png" });
  const large = await download(page);
  const largePdf = await PDFDocument.load(large.bytes);
  expect(largePdf.getPageCount()).toBe(1);
  expect(largePdf.getPage(0).getWidth()).toBeGreaterThanOrEqual(
    largePdf.getPage(0).getHeight(),
  );
  await test.info().attach("wallet-tiled.pdf", {
    body: first.bytes,
    contentType: "application/pdf",
  });
  await test.info().attach("wallet-large.pdf", {
    body: large.bytes,
    contentType: "application/pdf",
  });
});

test("M3.3 phone paper controls validate margin, overlap and layers without editing the document", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  const before = await snapshot(page);
  await open(page);
  await expect(page.getByText(/Measure the 100 mm test square/)).toBeVisible();
  const margin = page.getByRole("textbox", {
    name: "Print margin (mm)",
    exact: true,
  });
  await margin.fill("");
  await expect(
    page.getByRole("button", { name: "Download PDF", exact: true }),
  ).toBeDisabled();
  await margin.fill("5");
  await page
    .getByRole("textbox", { name: "Tile overlap (mm)", exact: true })
    .fill("12");
  await page
    .getByRole("combobox", { name: "Paper orientation", exact: true })
    .click();
  await page.getByRole("option", { name: "Landscape", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Piece metadata", exact: true })
    .uncheck();
  await page.screenshot({ path: "/tmp/m33-pdf-phone.png" });
  const result = await download(page);
  const pdf = await PDFDocument.load(result.bytes);
  expect(pdf.getPage(0).getSize()).toEqual({
    width: 297 * pt,
    height: 210 * pt,
  });
  expect(await snapshot(page)).toEqual(before);
  await open(page);
  for (const name of [
    "Stitch outlines",
    "Cut outlines",
    "Fold marks",
    "Grainlines",
    "Notches",
    "Darts",
    "Text and labels",
    "Internal paths",
    "Piece metadata",
  ])
    await page.getByRole("checkbox", { name, exact: true }).uncheck();
  await expect(
    page.getByRole("button", { name: "Download PDF", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await snapshot(page)).toEqual(before);
});

test("M3.3 PDF font failures preserve geometry, cancellation and active-edit gating", async ({
  page,
}) => {
  await seed(page);
  await page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const { useEditor } = await import(path);
    const doc = structuredClone(useEditor.getState().document);
    doc.pieces.front.metadata.notes = "漢字";
    useEditor.getState().load(doc);
    useEditor.setState({ selected: Object.keys(doc.segments) });
  });
  const before = await snapshot(page);
  await open(page);
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("font cannot print");
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    (await import(path)).useEditor.setState({ hasDraft: true });
  });
  await open(page);
  await expect(
    page.getByRole("button", { name: "Download PDF", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await snapshot(page)).toEqual(before);
});

test("M3.3 cancelling while the PDF library loads prevents a later download", async ({
  page,
}) => {
  await seed(page);
  const before = await snapshot(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const requested = new Promise<void>((resolve) => {
    entered = resolve;
  });
  await page.route("**/src/export/pdf.ts", async (route) => {
    entered();
    await held;
    await route.continue();
  });
  let downloads = 0;
  page.on("download", () => {
    downloads++;
  });
  await open(page);
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  await requested;
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const loaded = page.waitForResponse((response) =>
    response.url().endsWith("/src/export/pdf.ts"),
  );
  release();
  await loaded;
  await page.waitForLoadState("networkidle");
  expect(downloads).toBe(0);
  expect(await snapshot(page)).toEqual(before);
});
