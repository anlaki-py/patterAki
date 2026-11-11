import { expect, test, type Page } from "@playwright/test";

async function seed(page: Page, kind: "line" | "corner" | "curve" = "line") {
  await page.goto("/");
  await expect(page.locator("svg.drafting-surface")).toBeVisible();
  await page.evaluate(async (kind) => {
    const storePath = "/src/editor/store.ts";
    const schemaPath = "/src/document/schema.ts";
    const { useEditor } = await import(storePath);
    const { emptyDocument } = await import(schemaPath);
    const doc = emptyDocument("browser-m12");
    doc.unitsDisplay = "mm";
    doc.points = { a: { x: 100, y: 100 }, b: { x: 200, y: 100 } };
    doc.segments = { edge: { id: "edge", kind: "line", from: "a", to: "b" } };
    if (kind === "corner") {
      doc.points.c = { x: 200, y: 200 };
      doc.segments.next = { id: "next", kind: "line", from: "b", to: "c" };
    }
    if (kind === "curve")
      doc.segments.edge = {
        ...doc.segments.edge,
        kind: "cubic",
        control1: { x: 120, y: 150 },
        control2: { x: 180, y: 150 },
      };
    useEditor.getState().load(doc);
    useEditor.setState({
      selected: ["edge"],
      tool: "select",
      snap: false,
      showRulers: false,
      lengthAnchor: "start",
    });
  }, kind);
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const { useEditor } = await import(path);
    const s = useEditor.getState();
    return {
      doc: s.document,
      preview: s.preview,
      past: s.past.length,
      anchor: s.lengthAnchor,
      selected: s.selected,
    };
  });
}
async function canvasPoint(page: Page, x: number, y: number) {
  const box = await page.locator("svg.drafting-surface").boundingBox();
  return { x: box!.x + 40 + x * 2, y: box!.y + 40 + y * 2 };
}

test("label and Enter open exact length with remembered anchors, preview, cancel and undo", async ({
  page,
}) => {
  await seed(page, "corner");
  await page.locator('[data-dimension="edge"]').click();
  const field = page.getByRole("textbox", { name: "Length (mm)", exact: true });
  await expect(field).toBeFocused();
  await field.fill("12.5 cm");
  expect((await state(page)).doc.points.b.x).toBe(200);
  expect((await state(page)).preview.points.b.x).toBe(225);
  await page.getByText("Center", { exact: true }).click();
  expect((await state(page)).preview.points.a.x).toBe(87.5);
  await page.screenshot({ path: "test-results/m12-dimensions.png" });
  await field.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await state(page)).past).toBe(1);
  expect((await state(page)).doc.points.b.x).toBe(212.5);
  await page.locator("svg.drafting-surface").focus();
  await page.keyboard.press("Enter");
  await expect(field).toBeFocused();
  await field.fill("0 mm");
  await expect(
    page.getByRole("button", { name: "Apply length", exact: true }),
  ).toBeDisabled();
  await field.press("Escape");
  expect((await state(page)).past).toBe(1);
  expect((await state(page)).anchor).toBe("center");
  await page.locator("svg.drafting-surface").focus();
  await page.keyboard.press("Control+z");
  expect((await state(page)).doc.points.b.x).toBe(200);
});

test("typing exact length follows preview angle, ignores grid, commits once", async ({
  page,
}) => {
  await seed(page);
  const canvas = page.locator("svg.drafting-surface");
  await canvas.focus();
  await page.keyboard.press("l");
  const start = await canvasPoint(page, 100, 250),
    end = await canvasPoint(page, 200, 300);
  await page.mouse.click(start.x, start.y);
  await page.mouse.move(end.x, end.y);
  await page.keyboard.type("125 mm");
  const length = page.getByRole("textbox", { name: "Exact length (mm)" });
  await expect(length).toHaveValue("125 mm");
  await page.getByRole("textbox", { name: "Angle (degrees)" }).fill("30");
  await expect(page.locator("[data-draft-dimension]")).toContainText("125 mm");
  await length.press("Enter");
  const s = await state(page);
  expect(s.past).toBe(1);
  const edge = Object.values(s.doc.segments).find(
    (e) => (e as { id: string }).id !== "edge",
  ) as { from: string; to: string };
  const a = s.doc.points[edge.from],
    b = s.doc.points[edge.to];
  expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(125, 8);
  expect((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI).toBeCloseTo(30, 8);
});

test("equal and repeated splits preview, reject dense entries, cancel and undo atomically", async ({
  page,
}) => {
  await seed(page, "curve");
  await page.getByRole("button", { name: "Edge actions", exact: true }).click();
  await page
    .getByRole("menuitem", {
      name: "Divide into N equal segments…",
      exact: true,
    })
    .click();
  await page
    .getByRole("textbox", { name: "Number of equal segments" })
    .fill("4");
  expect(Object.keys((await state(page)).preview.segments)).toHaveLength(4);
  await page.getByRole("button", { name: "Apply divisions" }).click();
  expect((await state(page)).past).toBe(1);
  await page.locator("svg.drafting-surface").focus();
  await page.keyboard.press("Control+z");
  expect(Object.keys((await state(page)).doc.segments)).toHaveLength(1);
  const curveMiddle = await canvasPoint(page, 150, 137.5);
  await page.mouse.click(curveMiddle.x, curveMiddle.y);
  await page.getByRole("button", { name: "Edge actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Divide every N mm…", exact: true })
    .click();
  const spacing = page.getByRole("textbox", {
    name: "Spacing (mm, or type mm)",
  });
  await spacing.fill("0.0001 mm");
  await expect(
    page.getByRole("button", { name: "Apply divisions" }),
  ).toBeDisabled();
  await spacing.press("Escape");
  expect((await state(page)).preview).toBeNull();
  expect(Object.keys((await state(page)).doc.segments)).toHaveLength(1);
});

test("vertex preview shows adjacent values and Escape preserves exact geometry", async ({
  page,
}) => {
  await seed(page, "corner");
  const from = await canvasPoint(page, 200, 100),
    to = await canvasPoint(page, 230, 120);
  const original = (await state(page)).doc;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await expect(page.locator('[data-dimension="next"]')).toContainText("→");
  await expect(page.locator("svg.drafting-surface")).toContainText("ΔX");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect((await state(page)).doc).toEqual(original);
  expect((await state(page)).past).toBe(0);
});

test("double click finishes a polyline once without duplicate vertices", async ({
  page,
}) => {
  await seed(page);
  await page.locator("svg.drafting-surface").focus();
  await page.keyboard.press("p");
  const a = await canvasPoint(page, 100, 250),
    b = await canvasPoint(page, 200, 250),
    c = await canvasPoint(page, 250, 300);
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  await page.mouse.dblclick(c.x, c.y);
  expect((await state(page)).past).toBe(1);
  expect(Object.keys((await state(page)).doc.segments)).toHaveLength(3);
  expect(Object.keys((await state(page)).doc.points)).toHaveLength(5);
});

test("edge auto-pan changes the view and leaves committed geometry untouched", async ({
  page,
}) => {
  await seed(page);
  const original = (await state(page)).doc;
  await page.locator("svg.drafting-surface").focus();
  await page.keyboard.press("p");
  const a = await canvasPoint(page, 100, 250);
  await page.mouse.click(a.x, a.y);
  const box = await page.locator("svg.drafting-surface").boundingBox();
  const transform = () =>
    page
      .locator("svg.drafting-surface > g[transform]")
      .getAttribute("transform");
  const before = await transform();
  await page.mouse.move(box!.x + box!.width - 5, box!.y + box!.height / 2);
  await expect.poll(transform).not.toBe(before);
  await page.keyboard.press("Escape");
  expect((await state(page)).doc).toEqual(original);
  expect((await state(page)).past).toBe(0);
});

test("percentage origin and split hover report arc distances before clicking", async ({
  page,
}) => {
  await seed(page);
  await page.locator("svg.drafting-surface").focus();
  await page.keyboard.press("x");
  const middle = await canvasPoint(page, 140, 100);
  await page.mouse.move(middle.x, middle.y);
  await expect(
    page.getByRole("button", { name: "Edit split distances" }),
  ).toContainText("From A 40 mm · To B 60 mm · 40.0%");
  await page.keyboard.press("v");
  const edgeMiddle = await canvasPoint(page, 150, 100);
  await page.mouse.click(edgeMiddle.x, edgeMiddle.y);
  await page.getByRole("button", { name: "Edge actions", exact: true }).click();
  await page
    .getByRole("menuitem", {
      name: "Add at midpoint / Split at %…",
      exact: true,
    })
    .click();
  await page.getByText("From center", { exact: true }).click();
  await page.getByRole("textbox", { name: "Percent", exact: true }).fill("-25");
  await page.getByRole("button", { name: "Apply divisions" }).click();
  const doc = (await state(page)).doc;
  expect(Object.values(doc.points)).toContainEqual({ x: 125, y: 100 });
  expect((await state(page)).past).toBe(1);
});

test("curve handle preview cancels on lost capture and group movement auto-pans", async ({
  page,
}) => {
  await seed(page, "curve");
  const original = (await state(page)).doc;
  const handle = await canvasPoint(page, 120, 150),
    target = await canvasPoint(page, 120, 180);
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 4 });
  await expect(page.locator('[data-dimension="edge"]')).toContainText("Arc");
  expect((await state(page)).preview).not.toBeNull();
  await page
    .locator("svg.drafting-surface")
    .dispatchEvent("lostpointercapture");
  await page.mouse.up();
  expect((await state(page)).preview).toBeNull();
  expect((await state(page)).doc).toEqual(original);
  const curveMiddle = await canvasPoint(page, 150, 137.5);
  await page.mouse.move(curveMiddle.x, curveMiddle.y);
  await page.mouse.down();
  const box = await page.locator("svg.drafting-surface").boundingBox();
  const transform = () =>
    page
      .locator("svg.drafting-surface > g[transform]")
      .getAttribute("transform");
  const before = await transform();
  await page.mouse.move(box!.x + box!.width - 5, box!.y + box!.height / 2, {
    steps: 5,
  });
  await expect.poll(transform).not.toBe(before);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect((await state(page)).doc).toEqual(original);
});

test.describe("touch", () => {
  test.use({ hasTouch: true, viewport: { width: 800, height: 1000 } });
  test("dimension taps open a focused numeric field", async ({ page }) => {
    await seed(page);
    await page.locator('[data-dimension="edge"]').tap();
    await expect(
      page.getByRole("textbox", { name: "Length (mm)", exact: true }),
    ).toBeFocused();
    await page
      .getByRole("textbox", { name: "Length (mm)", exact: true })
      .fill("125 mm");
    await page.getByRole("button", { name: "Apply length", exact: true }).tap();
    expect((await state(page)).doc.points.b.x).toBe(225);
    expect((await state(page)).past).toBe(1);
  });
});

test("Move accepts signed unit suffixes and Enter finishes an exact polyline once", async ({
  page,
}) => {
  await seed(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("menuitem", { name: "Move…", exact: true }).click();
  await page.getByRole("textbox", { name: "ΔX (mm)" }).fill("-1 cm");
  await page.getByRole("textbox", { name: "ΔY (mm)" }).fill("2.5 mm");
  expect((await state(page)).doc.points.a).toEqual({ x: 100, y: 100 });
  await page.getByRole("button", { name: "Apply move" }).click();
  // Wait for the modal's exit transition before sending workspace shortcuts.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await state(page)).doc.points.a).toEqual({ x: 90, y: 102.5 });
  expect((await state(page)).past).toBe(1);
  await page.locator("svg.drafting-surface").focus();
  await page.keyboard.press("p");
  const start = await canvasPoint(page, 100, 250);
  await page.mouse.click(start.x, start.y);
  await page.keyboard.press("Enter");
  const length = page.getByRole("textbox", { name: "Exact length (mm)" });
  await expect(length).toBeFocused();
  await length.fill("125 mm");
  await page.getByRole("textbox", { name: "Angle (degrees)" }).fill("0");
  await length.press("Enter");
  expect((await state(page)).past).toBe(1);
  await page.keyboard.press("Enter");
  expect((await state(page)).past).toBe(2);
  expect(Object.keys((await state(page)).doc.segments)).toHaveLength(2);
});
