import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function ready(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const path = "/src/editor/store.ts";
        return (await import(path)).useEditor.getState().ready;
      }),
    )
    .toBe(true);
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const s = (await import(path)).useEditor.getState();
    return {
      doc: s.document,
      past: s.past.length,
      snap: s.snap,
      preview: s.preview,
      status: s.saveStatus,
    };
  });
}
async function file(page: Page, name: string) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function saved(page: Page) {
  await expect
    .poll(async () => (await state(page)).status)
    .toBe("Saved locally");
}
async function seed(page: Page) {
  await page.goto("/");
  await ready(page);
  await page.evaluate(async () => {
    const a = "/src/document/schema.ts",
      b = "/src/document/operations.ts",
      c = "/src/editor/store.ts";
    const { emptyDocument } = await import(a),
      { addPath } = await import(b),
      { useEditor } = await import(c);
    let n = 0;
    const doc = addPath(
      { ...emptyDocument("m41-source"), name: "Source panel" },
      [
        { x: 0, y: 0 },
        { x: 180, y: 0 },
        { x: 180, y: 240 },
        { x: 0, y: 240 },
      ],
      true,
      () => `m41-${++n}`,
    );
    useEditor.getState().load(doc);
  });
  await page.keyboard.press("Control+s");
  await saved(page);
  return (await state(page)).doc;
}
const naming = (page: Page) =>
  page.getByRole("dialog").filter({
    has: page.getByRole("textbox", { name: "Project name", exact: true }),
  });
const row = (page: Page, id: string) =>
  page.locator(`[data-project-row="${id}"]`);
async function stored(page: Page, id: string) {
  return page.evaluate(async (projectId) => {
    const path = "/src/persistence/projects.ts";
    return (await import(path)).db.projects.get(projectId);
  }, id);
}

test("M4.1 project CRUD, project-local preferences and last-active workspace survive reopening", async ({
  page,
}) => {
  test.setTimeout(120000);
  const source = await seed(page);
  await file(page, "Open saved project…");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await naming(page)
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill("Second project");
  await naming(page)
    .getByRole("button", { name: "Create", exact: true })
    .click();
  await expect
    .poll(async () => (await state(page)).doc.name)
    .toBe("Second project");
  const secondId = (await state(page)).doc.id;
  await page.getByRole("switch", { name: "Snap", exact: true }).uncheck();
  await page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const { useEditor } = await import(path);
    useEditor
      .getState()
      .commit({ ...useEditor.getState().document, unitsDisplay: "in" });
  });
  await page
    .getByRole("button", { name: "Toggle color scheme", exact: true })
    .click();
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  const theme = await page
    .locator("html")
    .getAttribute("data-mantine-color-scheme");
  await page.keyboard.press("Control+s");
  await saved(page);
  await page.reload();
  await ready(page);
  expect((await state(page)).doc.id).toBe(secondId);
  expect((await state(page)).doc.unitsDisplay).toBe("in");
  expect((await state(page)).snap).toBe(false);
  await expect(page.locator("html")).toHaveAttribute(
    "data-mantine-color-scheme",
    theme!,
  );
  await expect(
    page.getByRole("button", { name: "Properties", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await file(page, "Open saved project…");
  await row(page, source.id)
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await expect.poll(async () => (await state(page)).doc.id).toBe(source.id);
  expect((await state(page)).doc).toEqual(source);
  expect((await state(page)).snap).toBe(true);
  await file(page, "Open saved project…");
  await row(page, source.id)
    .getByRole("button", { name: "Duplicate", exact: true })
    .click();
  await naming(page)
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill("Independent copy");
  await naming(page)
    .getByRole("button", { name: "Duplicate", exact: true })
    .click();
  await expect
    .poll(async () => (await state(page)).doc.name)
    .toBe("Independent copy");
  const copyId = (await state(page)).doc.id;
  expect(copyId).not.toBe(source.id);
  expect((await state(page)).doc.points).toEqual(source.points);
  await file(page, "Rename project…");
  await naming(page)
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill("Renamed copy");
  await naming(page)
    .getByRole("button", { name: "Rename", exact: true })
    .click();
  await expect
    .poll(async () => (await stored(page, copyId))?.document.name)
    .toBe("Renamed copy");
  await file(page, "Open saved project…");
  await row(page, secondId)
    .getByRole("button", { name: "Rename", exact: true })
    .click();
  await naming(page)
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill("Second renamed");
  await naming(page)
    .getByRole("button", { name: "Rename", exact: true })
    .click();
  await expect
    .poll(async () => (await stored(page, secondId))?.document.name)
    .toBe("Second renamed");
  expect((await state(page)).doc.name).toBe("Renamed copy");
  await page.reload();
  await ready(page);
  expect((await state(page)).doc.id).toBe(copyId);
  await file(page, "Delete saved project…");
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  expect(await stored(page, copyId)).toBeDefined();
  await file(page, "Delete saved project…");
  await page
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  await expect
    .poll(async () => (await stored(page, copyId)) === undefined)
    .toBe(true);
  expect((await stored(page, source.id))?.document).toEqual(source);
  expect((await stored(page, secondId))?.document.unitsDisplay).toBe("in");
  await file(page, "Open saved project…");
  await expect(
    page.getByText("Most recently edited first.", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/m41-projects-desktop.png",
    animations: "disabled",
  });
});

test("M4.1 two tabs refuse stale writes and preserve the losing tab as a recovery copy", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const source = await seed(page);
  const other = await context.newPage();
  await other.goto("/");
  await ready(other);
  expect((await state(other)).doc.id).toBe(source.id);
  await page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const { useEditor } = await import(path);
    useEditor
      .getState()
      .commit({ ...useEditor.getState().document, name: "First tab winner" });
  });
  await page.keyboard.press("Control+s");
  await saved(page);
  await expect
    .poll(async () => (await state(other)).status)
    .toMatch(/Conflict/);
  await other.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const { useEditor } = await import(path);
    const s = useEditor.getState();
    s.commit({ ...s.document, name: "Second tab work" });
  });
  await other.keyboard.press("Control+s");
  await expect
    .poll(async () => (await state(other)).status)
    .toMatch(/Conflict/);
  expect((await stored(page, source.id))?.document.name).toBe(
    "First tab winner",
  );
  expect((await state(other)).doc.name).toBe("Second tab work");
  await other
    .getByRole("button", { name: "Save recovery copy", exact: true })
    .click();
  await naming(other)
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill("Second tab recovered");
  await naming(other)
    .getByRole("button", { name: "Save copy", exact: true })
    .click();
  await expect
    .poll(async () => (await state(other)).doc.name)
    .toBe("Second tab recovered");
  await saved(other);
  expect((await state(other)).doc.id).not.toBe(source.id);
  expect((await stored(page, source.id))?.document.name).toBe(
    "First tab winner",
  );
  expect((await state(other)).doc.points).toEqual(source.points);
  await other.close();
});

test("M4.1 invalid imports and corrupt stored schemas retain geometry and offer raw backup and checkpoints", async ({
  page,
}) => {
  test.setTimeout(90000);
  const original = await seed(page);
  for (const input of [
    "{ invalid",
    JSON.stringify({ ...original, schemaVersion: 999 }),
  ]) {
    await page.locator('input[type="file"]').setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from(input),
    });
    await expect(
      page.getByText("Import failed", { exact: true }).first(),
    ).toBeVisible();
    expect((await state(page)).doc).toEqual(original);
  }
  await page.evaluate(async () => {
    const path = "/src/editor/store.ts";
    const { useEditor } = await import(path);
    useEditor
      .getState()
      .commit({ ...useEditor.getState().document, name: "Checkpoint two" });
  });
  await page.keyboard.press("Control+s");
  await saved(page);
  await page.evaluate(async () => {
    const path = "/src/persistence/projects.ts";
    const { db } = await import(path);
    const row = await db.projects.get("m41-source");
    await db.projects.update("m41-source", {
      document: { ...row.document, schemaVersion: 999 },
      revision: 999,
    });
  });
  await page.reload();
  await ready(page);
  await expect(
    page.getByRole("button", { name: "Export JSON backup", exact: true }),
  ).toBeVisible();
  await file(page, "Open saved project…");
  await expect(
    row(page, original.id).getByRole("button", { name: "Open", exact: true }),
  ).toBeDisabled();
  const waiting = page.waitForEvent("download");
  await row(page, original.id)
    .getByRole("button", { name: "Export stored JSON", exact: true })
    .click();
  const backup = await waiting;
  expect(
    JSON.parse(await readFile((await backup.path())!, "utf8")).schemaVersion,
  ).toBe(999);
  await row(page, original.id)
    .getByRole("button", { name: "Recovery", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Open recovery copy · revision 1/ })
    .click();
  await expect
    .poll(async () => (await state(page)).doc.id)
    .not.toBe(original.id);
  await expect
    .poll(async () => (await state(page)).doc.name)
    .toBe("Source panel recovered");
  expect((await state(page)).doc.points).toEqual(original.points);
  expect((await stored(page, original.id))?.document.schemaVersion).toBe(999);
});

test("M4.1 quota failures keep committed and transient work, with backup and actual beforeunload warning", async ({
  page,
}) => {
  test.setTimeout(90000);
  await seed(page);
  const before = await state(page);
  await page.evaluate(async () => {
    const a = "/src/persistence/projects.ts",
      b = "/src/editor/store.ts";
    const { db } = await import(a),
      { useEditor } = await import(b);
    db.checkpoints.hook("creating", () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    const doc = { ...useEditor.getState().document, name: "In-memory work" };
    useEditor.getState().commit(doc);
    useEditor.setState({
      preview: { ...doc, name: "Unfinished drag" },
      hasDraft: true,
      gestureActive: true,
    });
  });
  await page.keyboard.press("Control+s");
  await expect(
    page.getByRole("button", { name: "Export JSON backup", exact: true }),
  ).toBeVisible();
  expect((await state(page)).doc.name).toBe("In-memory work");
  expect((await state(page)).preview?.name).toBe("Unfinished drag");
  expect((await stored(page, before.doc.id))?.document).toEqual(before.doc);
  const waiting = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export JSON backup", exact: true })
    .click();
  const backup = await waiting;
  const json = JSON.parse(await readFile((await backup.path())!, "utf8"));
  expect(json.name).toBe("In-memory work");
  expect(JSON.stringify(json)).not.toContain("Unfinished drag");
  const dialog = page.waitForEvent("dialog");
  const navigation = page.reload({ timeout: 5000 }).catch(() => undefined);
  const warning = await dialog;
  expect(warning.type()).toBe("beforeunload");
  await warning.dismiss();
  await navigation;
  expect((await state(page)).doc.name).toBe("In-memory work");
  expect((await state(page)).preview?.name).toBe("Unfinished drag");
});

test("M4.1 phone storage protection and recovery preference report refusal without promising permanent storage", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  await page.evaluate(() =>
    Object.defineProperty(navigator.storage, "persist", {
      configurable: true,
      value: async () => false,
    }),
  );
  await file(page, "Open saved project…");
  await page
    .getByRole("button", { name: "Protect local storage", exact: true })
    .click();
  await expect(
    page.getByText(/Persistent storage was not granted/),
  ).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "Keep last five recovery checkpoints",
      exact: true,
    })
    .uncheck();
  await page.screenshot({
    path: "/tmp/m41-projects-phone.png",
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Close project browser", exact: true })
    .click();
  await page.reload();
  await ready(page);
  await file(page, "Open saved project…");
  await expect(
    page.getByRole("checkbox", {
      name: "Keep last five recovery checkpoints",
      exact: true,
    }),
  ).not.toBeChecked();
});

test("M4.1 a new edit made while deletion waits is retained in memory", async ({
  page,
}) => {
  const source = await seed(page);
  await page.evaluate(async () => {
    const path = "/src/persistence/repository.ts";
    const repo = (await import(path)).repository();
    const remove = repo.remove.bind(repo);
    const held = new Promise<void>((resolve) =>
      Reflect.set(window, "releaseDeletion", resolve),
    );
    repo.remove = async (id: string) => {
      await remove(id);
      Reflect.set(window, "deletionReached", true);
      await held;
    };
  });
  await file(page, "Delete saved project…");
  await page
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  await expect
    .poll(async () =>
      page.evaluate(() => Reflect.get(window, "deletionReached") === true),
    )
    .toBe(true);
  const pointId = Object.keys(source.points)[0];
  await page.evaluate(async (id) => {
    const path = "/src/editor/store.ts";
    const { useEditor } = await import(path);
    const s = useEditor.getState();
    s.commit({
      ...s.document,
      points: {
        ...s.document.points,
        [id]: { ...s.document.points[id], x: 7 },
      },
    });
    Reflect.get(window, "releaseDeletion")();
  }, pointId);
  await expect(
    page.getByText(
      "Deletion stopped because the drawing changed. Newer work was kept in memory.",
      { exact: true },
    ),
  ).toBeVisible();
  expect((await state(page)).doc.id).toBe(source.id);
  expect((await state(page)).doc.points[pointId].x).toBe(7);
  expect(await stored(page, source.id)).toBeUndefined();
  await expect(
    page.getByRole("button", { name: "Export JSON backup", exact: true }),
  ).toBeVisible();
});

test("M4.1 replacement-storage failure after deletion keeps the drawing and offers backup", async ({
  page,
}) => {
  const source = await seed(page);
  await page.evaluate(async (id) => {
    const path = "/src/persistence/repository.ts";
    const repo = (await import(path)).repository();
    const save = repo.save.bind(repo);
    repo.save = async (document: { id: string }, settings: unknown) => {
      if (document.id !== id)
        throw new DOMException("Replacement quota", "QuotaExceededError");
      return save(document, settings);
    };
  }, source.id);
  await file(page, "Delete saved project…");
  await page
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Export JSON backup", exact: true }),
  ).toBeVisible();
  expect((await state(page)).doc).toEqual(source);
  expect(await stored(page, source.id)).toBeUndefined();
  expect((await state(page)).status).toMatch(/Save failed/);
});
