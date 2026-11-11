import { expect, test } from "@playwright/test";

test("an ordinary corner bend stays valid, commits once, and supports undo/redo", async ({
  page,
}) => {
  await page.goto("/");
  const canvas = page.locator("svg.drafting-surface");
  await expect(canvas).toBeVisible();
  const original = await page.evaluate(async () => {
    const storePath = "/src/editor/store.ts",
      schemaPath = "/src/document/schema.ts";
    const { useEditor } = await import(storePath),
      { emptyDocument } = await import(schemaPath);
    const doc = emptyDocument("decimal-corner");
    doc.points = {
      a: { x: 145.02158287440426, y: 166.88008573450148 },
      b: { x: 358.32025439239106, y: 48.01974162071943 },
      c: { x: 358.32025439239106, y: 286.88008573450145 },
      d: { x: 145.02158287440426, y: 286.88008573450145 },
    };
    doc.segments = {
      ab: { id: "ab", kind: "line", from: "a", to: "b" },
      bc: { id: "bc", kind: "line", from: "b", to: "c" },
      cd: { id: "cd", kind: "line", from: "c", to: "d" },
      da: { id: "da", kind: "line", from: "d", to: "a" },
    };
    useEditor.getState().load(doc);
    useEditor.setState({
      tool: "curve",
      selected: ["ab"],
      snap: false,
      showRulers: false,
    });
    return doc;
  });
  const box = (await canvas.boundingBox())!;
  const handle = page.locator(
    '[data-handle-edge="ab"][data-handle="control1"]',
  );
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + 40 + 214.02893539511598 * 2,
    box.y + 40 + 108.70418860189616 * 2,
    { steps: 12 },
  );
  await expect(page.locator(".invalid-preview")).toHaveCount(0);
  await expect(page.locator('[data-dimension="ab"]')).toContainText("Arc");
  await page.mouse.up();
  const state = () =>
    page.evaluate(async () => {
      const path = "/src/editor/store.ts";
      const { useEditor } = await import(path);
      const s = useEditor.getState();
      return {
        doc: s.document,
        past: s.past.length,
        preview: s.preview,
        issue: s.previewIssue,
      };
    });
  const committed = await state();
  expect(committed.past).toBe(1);
  expect(committed.doc.segments.ab.kind).toBe("cubic");
  expect(committed.doc.points).toEqual(original.points);
  expect(committed.preview).toBeNull();
  expect(committed.issue).toBeNull();
  await canvas.focus();
  await page.keyboard.press("Control+z");
  expect((await state()).doc).toEqual(original);
  await page.keyboard.press("Control+Shift+z");
  expect((await state()).doc).toEqual(committed.doc);
  await page.screenshot({ path: "test-results/valid-corner-bend.png" });
  // A genuine second crossing of the adjacent side must still cancel the edit.
  await page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const { useEditor } = await import(path);
    useEditor.setState({ selected: ["ab"] });
  });
  const restoredHandle = (await handle.boundingBox())!;
  await page.mouse.move(
    restoredHandle.x + restoredHandle.width / 2,
    restoredHandle.y + restoredHandle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    box.x + 40 + (original.points.a.x - 100) * 2,
    box.y + 40 + (original.points.a.y + 100) * 2,
    { steps: 8 },
  );
  await expect(page.locator(".invalid-preview")).toHaveCount(1);
  await page.mouse.up();
  const rejected = await state();
  expect(rejected.doc).toEqual(committed.doc);
  expect(rejected.past).toBe(1);
  expect(rejected.preview).toBeNull();
});
