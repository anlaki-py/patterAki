import { expect, test, type Page } from "@playwright/test";
import type { PatternDocument } from "../src/document/schema";

async function state(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const { useEditor } = await import(path);
    const s = useEditor.getState();
    return {
      ready: s.ready,
      document: s.document as PatternDocument,
      revision: s.revision,
      past: s.past.length,
      future: s.future.length,
      hasDraft: s.hasDraft,
      preview: s.preview,
    };
  });
}

async function seed(page: Page) {
  await page.goto("/");
  await expect.poll(async () => (await state(page)).ready).toBe(true);
  await page.evaluate(async () => {
    const storePath = "/src/editor/store.ts";
    const schemaPath = "/src/document/schema.ts";
    const { useEditor } = await import(storePath);
    const { emptyDocument } = await import(schemaPath);
    useEditor.getState().load({
      ...emptyDocument("focus-loss"),
      unitsDisplay: "mm",
    });
    useEditor.setState({ tool: "polyline", snap: false, showRulers: false });
  });
}

async function blur(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
}

async function draft(page: Page) {
  const canvas = page.locator("svg.drafting-surface");
  await canvas.click({ position: { x: 140, y: 140 } });
  await canvas.click({ position: { x: 340, y: 140 } });
  await expect.poll(async () => (await state(page)).hasDraft).toBe(true);
  return canvas;
}

test("focus loss preserves placed polyline points and exact input through a delayed release", async ({
  page,
}) => {
  await seed(page);
  const canvas = await draft(page);
  const length = page.getByRole("textbox", {
    name: "Exact length (mm)",
    exact: true,
  });
  const angle = page.getByRole("textbox", {
    name: "Angle (degrees)",
    exact: true,
  });
  await length.fill("75 mm");
  await angle.fill("90");
  const before = await state(page);
  const path = await page.locator("path.draft-line").getAttribute("d");
  await blur(page);
  await canvas.dispatchEvent("pointerup", { pointerId: 1 });
  expect(await state(page)).toEqual(before);
  await expect(length).toHaveValue("75 mm");
  await expect(angle).toHaveValue("90");
  await expect(page.locator("path.draft-line")).toHaveAttribute("d", path!);
  await length.press("Enter");
  await page.getByRole("button", { name: "Finish line", exact: true }).click();
  const after = await state(page);
  const edges = Object.values(after.document.segments);
  expect(edges).toHaveLength(2);
  expect(after.past).toBe(1);
  const lengths = edges.map((edge) => {
    const a = after.document.points[edge.from];
    const b = after.document.points[edge.to];
    return Math.hypot(b.x - a.x, b.y - a.y);
  });
  expect(lengths[0]).toBeCloseTo(100, 8);
  expect(lengths[1]).toBeCloseTo(75, 8);
});

test("focus loss cancels an edge drag and its late release without consuming history", async ({
  page,
}) => {
  await seed(page);
  const canvas = await draft(page);
  await page.getByRole("button", { name: "Finish line", exact: true }).click();
  await canvas.focus();
  await page.keyboard.press("v");
  const before = await state(page);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 240, box.y + 140);
  await page.mouse.down();
  await page.mouse.move(box.x + 270, box.y + 170, { steps: 4 });
  await expect.poll(async () => (await state(page)).preview).not.toBeNull();
  await blur(page);
  await expect.poll(async () => (await state(page)).preview).toBeNull();
  await page.mouse.up();
  expect(await state(page)).toEqual(before);
  await canvas.focus();
  await page.keyboard.press("Control+z");
  expect(Object.keys((await state(page)).document.segments)).toHaveLength(0);
});

test("losing focus during temporary pan retains the draft and releases Space", async ({
  page,
}) => {
  await seed(page);
  const canvas = await draft(page);
  await canvas.focus();
  await page.keyboard.down("Space");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 420, box.y + 320, { steps: 3 });
  const before = await state(page);
  await blur(page);
  await page.mouse.up();
  expect(await state(page)).toEqual(before);
  await canvas.click({ position: { x: 440, y: 350 } });
  await page.keyboard.up("Space");
  await page.getByRole("button", { name: "Finish line", exact: true }).click();
  expect(Object.keys((await state(page)).document.segments)).toHaveLength(2);
  expect((await state(page)).past).toBe(1);
});
