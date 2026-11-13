import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";

test.setTimeout(120_000);
async function seed(page: Page, piece = false) {
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = "/src/editor/store.ts";
        return (await import(path)).useEditor.getState().ready;
      }),
    )
    .toBe(true);
  await page.evaluate(async (piece) => {
    const a = "/src/editor/store.ts",
      b = "/src/document/schema.ts",
      c = "/src/document/operations.ts",
      d = "/src/document/annotations.ts",
      e = "/src/document/curves.ts",
      f = "/src/document/pieces.ts",
      g = "/src/document/piecePathsEdit.ts";
    const { useEditor } = await import(a),
      { emptyDocument } = await import(b),
      { addPath } = await import(c),
      { putAnnotation, newAnnotation } = await import(d),
      { convertToCurve } = await import(e),
      { createPieceFromEdge } = await import(f),
      { attachInternalPath } = await import(g);
    let sequence = 0;
    const id = () => `drawing-${++sequence}`;
    let doc = addPath(
      emptyDocument("browser-drawing-export"),
      [
        { x: 0, y: 0 },
        { x: 180, y: 0 },
        { x: 180, y: 240 },
        { x: 0, y: 240 },
      ],
      true,
      id,
    );
    if (piece)
      doc = createPieceFromEdge(doc, Object.keys(doc.segments)[0], "panel");
    else
      doc = addPath(
        doc,
        [
          { x: 0, y: 0 },
          { x: 80, y: 120 },
        ],
        false,
        id,
      );
    const previous = new Set(Object.keys(doc.segments));
    doc = addPath(
      doc,
      [
        { x: 30, y: 30 },
        { x: 140, y: 70 },
      ],
      false,
      id,
    );
    const inside = Object.keys(doc.segments).find((id) => !previous.has(id))!;
    doc = convertToCurve(doc, inside);
    if (piece) doc = attachInternalPath(doc, "panel", [inside], "inside");
    doc = putAnnotation(
      doc,
      newAnnotation("button", { x: 20, y: 20 }, "button"),
    );
    doc = putAnnotation(doc, newAnnotation("text", { x: 30, y: 100 }, "label"));
    useEditor.getState().load(doc);
    useEditor.setState({
      tool: "select",
      snap: false,
      showRulers: false,
      outlineVisibility: piece ? "cut" : "both",
      selected: piece
        ? doc.pieces.panel.stitchingOutline.map((ref) => ref.segmentId)
        : [],
    });
  }, piece);
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const s = (await import(path)).useEditor.getState();
    return { doc: s.document, past: s.past.length, selected: s.selected };
  });
}
async function open(page: Page, format: "SVG" | "PDF") {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page
    .getByRole("menuitem", {
      name: format === "SVG" ? "Export vector SVG…" : "Export actual-size PDF…",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: `Download ${format}`, exact: true }),
  ).toBeEnabled();
}
async function download(page: Page, format: "SVG" | "PDF") {
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: `Download ${format}`, exact: true })
    .click();
  const file = await pending;
  return readFile((await file.path())!);
}
async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("a branched drawing with no pieces downloads complete SVG and both PDF layouts", async ({
  page,
}) => {
  await seed(page);
  const before = await state(page);
  expect(before.doc.pieces).toEqual({});
  await open(page, "SVG");
  await expect(
    page.getByRole("combobox", { name: "Export scope", exact: true }),
  ).toHaveValue("Entire visible drawing");
  const svg = (await download(page, "SVG")).toString("utf8");
  expect(svg.match(/data-segment=/g)).toHaveLength(6);
  expect(svg).toContain('data-annotation="button"');
  expect(svg).toContain('data-annotation="label"');
  expect(svg).toContain(" C ");
  for (const layout of ["Tiled A4", "One large sheet"]) {
    await open(page, "PDF");
    await expect(
      page.getByRole("combobox", { name: "PDF scope", exact: true }),
    ).toHaveValue("Entire visible drawing");
    await choose(page, "Paper layout", layout);
    const pdf = await PDFDocument.load(await download(page, "PDF"));
    expect(pdf.getPageCount()).toBe(layout === "Tiled A4" ? 2 : 1);
  }
  expect(await state(page)).toEqual(before);
});

test("selected drawing items export only the selected line and mark on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  await page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const { useEditor } = await import(path);
    useEditor.setState({
      selected: [
        Object.keys(useEditor.getState().document.segments)[0],
        "button",
      ],
    });
  });
  const before = await state(page);
  await open(page, "SVG");
  await choose(page, "Export scope", "Selected drawing items (2)");
  const svg = (await download(page, "SVG")).toString("utf8");
  expect(svg.match(/data-segment=/g)).toHaveLength(1);
  expect(svg).toContain('data-annotation="button"');
  expect(svg).not.toContain('data-annotation="label"');
  await open(page, "PDF");
  await choose(page, "PDF scope", "Selected drawing items (2)");
  await page.screenshot({ path: "test-results/drawing-export-phone.png" });
  expect(
    (await PDFDocument.load(await download(page, "PDF"))).getPageCount(),
  ).toBe(2);
  expect(await state(page)).toEqual(before);
});

test("empty layers, cancellation and failed downloads preserve loose geometry and history", async ({
  page,
}) => {
  await seed(page);
  const before = await state(page);
  await open(page, "SVG");
  await page
    .getByRole("checkbox", { name: "Drawing lines and curves", exact: true })
    .uncheck();
  await page
    .getByRole("checkbox", { name: "Sewing marks and labels", exact: true })
    .uncheck();
  await expect(
    page.getByRole("button", { name: "Download SVG", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await state(page)).toEqual(before);
  await open(page, "SVG");
  await page.evaluate(() => {
    URL.createObjectURL = () => {
      throw new Error("Drawing download blocked");
    };
  });
  await page.getByRole("button", { name: "Download SVG", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Drawing download blocked",
  );
  expect(await state(page)).toEqual(before);
});

test("Cut view keeps internal points visible and Edit points reveals the complete editable outline", async ({
  page,
}) => {
  await seed(page, true);
  const before = await state(page);
  await expect(
    page.locator("circle.point:not([visibility='hidden'])"),
  ).toHaveCount(2);
  await expect(
    page.locator("path.edge-stroke[visibility='hidden']"),
  ).toHaveCount(4);
  await page.getByRole("button", { name: "Edit points", exact: true }).click();
  await expect(
    page.locator("circle.point:not([visibility='hidden'])"),
  ).toHaveCount(6);
  await expect(
    page.locator("path.edge-stroke[visibility='hidden']"),
  ).toHaveCount(0);
  await expect(page.locator("[data-point]")).toHaveCount(6);
  await page.screenshot({ path: "test-results/piece-edit-cut-view.png" });
  const after = await state(page);
  expect(after.doc).toEqual(before.doc);
  expect(after.past).toBe(before.past);
});
