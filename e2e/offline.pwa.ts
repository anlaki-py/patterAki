import { test, expect, type Page } from "@playwright/test";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
async function ready(page: Page) {
  await expect(page.locator("svg.drafting-surface")).toBeVisible();
}
async function file(page: Page, name: string) {
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function saved(page: Page) {
  await expect(page.getByRole("status")).toContainText("Saved locally");
}
async function cache(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await ready(page);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await expect(page.getByText("Offline app", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/App cached for offline use/)).toHaveCount(0);
}
async function draw(page: Page, offset = 0) {
  await page.getByRole("button", { name: "Line", exact: true }).click();
  const box = (await page.locator("svg.drafting-surface").boundingBox())!;
  await page.mouse.click(box.x + 140, box.y + 140 + offset);
  await page.getByRole("textbox", { name: /Exact length/ }).fill("100 mm");
  await page
    .getByRole("textbox", { name: "Angle (degrees)", exact: true })
    .fill("0");
  await page.getByRole("textbox", { name: /Exact length/ }).press("Enter");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+s");
  await saved(page);
}
async function backup(page: Page) {
  const pending = page.waitForEvent("download");
  await file(page, "Export editable JSON");
  const download = await pending;
  return JSON.parse(await readFile((await download.path())!, "utf8"));
}

test("production PWA manifest, cold offline startup, editing, project reopening and complete reference JSON backup", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await ready(page);
  await cache(page);
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>("link[rel=manifest]")!;
    return (await fetch(link.href)).json();
  });
  expect(manifest.display).toBe("standalone");
  expect(
    manifest.icons.some((i: { sizes: string }) => i.sizes === "512x512"),
  ).toBe(true);
  await file(page, "Reference images…");
  await page
    .getByRole("dialog")
    .locator("input[type=file]")
    .setInputFiles("public/icon-192.png");
  await expect(
    page.getByRole("img", { name: "Reference point picker" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Apply reference", exact: true })
    .click();
  await page.keyboard.press("Control+s");
  await saved(page);
  await draw(page);
  const original = await backup(page);
  expect(original.assets).toHaveLength(1);
  await expect(page.getByText(/App cached for offline use/)).toHaveCount(0);
  await context.setOffline(true);
  const cold = await context.newPage();
  await page.close();
  await cold.goto("/");
  await ready(cold);
  await expect(cold.locator("[data-layer=references] image")).toHaveCount(1);
  expect(await backup(cold)).toEqual(original);
  await expect(cold.getByText(/App cached for offline use/)).toHaveCount(0);
  await draw(cold, 100);
  const edited = await backup(cold);
  expect(Object.keys(edited.document.segments)).toHaveLength(2);
  await file(cold, "New project");
  await saved(cold);
  await file(cold, "Open saved project…");
  await cold.getByRole("button", { name: "Open", exact: true }).first().click();
  await expect(cold.getByRole("dialog")).toHaveCount(0);
  const reopened = await backup(cold);
  expect(reopened.document.id).toBe(edited.document.id);
  expect(reopened.document.segments).toEqual(edited.document.segments);
  await cold.reload();
  await ready(cold);
  await expect(cold.getByText(/App cached for offline use/)).toHaveCount(0);
  expect(await backup(cold)).toEqual(edited);
  await cold.screenshot({ path: "test-results/offline-production.png" });
});

test("new offline-capable service worker waits, refuses draft reload and quota failure, then preserves project through explicit update", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await ready(page);
  await cache(page);
  await draw(page);
  const original = await backup(page);
  const other = await context.newPage();
  await other.goto("/");
  await ready(other);
  await other.getByRole("button", { name: "Line", exact: true }).click();
  const otherBox = (await other.locator("svg.drafting-surface").boundingBox())!;
  await other.mouse.click(otherBox.x + 150, otherBox.y + 150);
  let otherLoads = 0;
  other.on("load", () => otherLoads++);
  const sw = await readFile("dist/sw.js", "utf8");
  try {
    await writeFile(
      "dist/sw.js",
      sw + "\n/* M4.2 update acceptance fixture */\n",
    );
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg!.update();
    });
    await expect(
      page.getByText("App update available", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Line", exact: true }).click();
    const box = (await page.locator("svg.drafting-surface").boundingBox())!;
    await page.mouse.click(box.x + 160, box.y + 160);
    await expect(
      page.getByRole("button", { name: "Save and update", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    // Refuse the update if IndexedDB cannot safeguard work, preserving the installed worker.
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.put;
      Reflect.set(window, "restorePut", () => {
        IDBObjectStore.prototype.put = original;
      });
      IDBObjectStore.prototype.put = function () {
        throw new DOMException(
          "Injected storage quota failure",
          "QuotaExceededError",
        );
      };
    });
    await page
      .getByRole("button", { name: "Save and update", exact: true })
      .click();
    await expect(
      page.getByText(/Could not safeguard the project/),
    ).toBeVisible();
    await page.evaluate(() => {
      (Reflect.get(window, "restorePut") as () => void)();
    });
    const updatedLoad = page.waitForEvent("load");
    await page
      .getByRole("button", { name: "Save and update", exact: true })
      .click();
    await updatedLoad;
    await ready(page);
    expect(await backup(page)).toEqual(original);
    expect(otherLoads).toBe(0);
    await expect(
      other.getByRole("button", { name: "Cancel draft", exact: true }),
    ).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await ready(page);
    expect(await backup(page)).toEqual(original);
  } finally {
    await writeFile("dist/sw.js", sw);
  }
});

test("offline worker registration failure reports a warning while drawing and backups remain usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.serviceWorker.register = async () => {
      throw new Error("Injected service worker failure");
    };
  });
  await page.goto("/");
  await ready(page);
  await expect(page.getByText(/Offline startup is unavailable/)).toBeVisible();
  await draw(page);
  expect(Object.keys((await backup(page)).segments)).toHaveLength(1);
});

test("failed service-worker cache installation retains the previous offline shell and current project", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await ready(page);
  await cache(page);
  await draw(page);
  const original = await backup(page);
  const sw = await readFile("dist/sw.js", "utf8");
  try {
    await writeFile(
      "dist/sw.js",
      sw +
        '\nself.addEventListener("install", event => event.waitUntil(Promise.reject(new Error("Injected cache quota error"))));\n',
    );
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())!.update();
    });
    await expect(
      page.getByText(/Offline cache installation failed/),
    ).toBeVisible();
    expect(await backup(page)).toEqual(original);
    await context.setOffline(true);
    await page.reload();
    await ready(page);
    expect(await backup(page)).toEqual(original);
  } finally {
    await writeFile("dist/sw.js", sw);
  }
});

test("a stored v3 database and v9 document migrate without losing geometry and reopen offline", async ({
  page,
  context,
}) => {
  await page.route("https://localhost:4173/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Legacy storage fixture</title>",
    }),
  );
  await page.goto("/");
  await page.evaluate(async () => {
    const open = indexedDB.open("patternaki", 3);
    open.onupgradeneeded = () => {
      const db = open.result;
      const projects = db.createObjectStore("projects", { keyPath: "id" });
      projects.createIndex("updatedAt", "updatedAt");
      for (const name of ["settings", "preferences", "projectSettings"])
        db.createObjectStore(name, { keyPath: "id" });
      const checkpoints = db.createObjectStore("checkpoints", {
        keyPath: "id",
      });
      checkpoints.createIndex("projectId", "projectId");
      checkpoints.createIndex("savedAt", "savedAt");
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const tx = db.transaction("projects", "readwrite");
    tx.objectStore("projects").put({
      id: "legacy-offline",
      updatedAt: 1,
      revision: 1,
      document: {
        schemaVersion: 9,
        id: "legacy-offline",
        name: "Legacy offline ruler",
        unitsDisplay: "mm",
        annotations: {},
        guides: {},
        pieces: {},
        points: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
        segments: { line: { id: "line", kind: "line", from: "a", to: "b" } },
      },
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.unroute("https://localhost:4173/");
  await page.reload();
  await ready(page);
  await cache(page);
  const migrated = await backup(page);
  expect(migrated.schemaVersion).toBe(11);
  expect(migrated.points.b.x).toBe(100);
  await page.keyboard.press("Control+s");
  await saved(page);
  await context.setOffline(true);
  await page.reload();
  await ready(page);
  expect(await backup(page)).toEqual(migrated);
});

test("a normal Chromium profile reports no PWA installability errors", async ({
  playwright,
}, testInfo) => {
  const profile = await mkdtemp(join(tmpdir(), "patternaki-install-"));
  const context = await playwright.chromium.launchPersistentContext(profile, {
    ...testInfo.project.use.launchOptions,
    headless: true,
    ignoreHTTPSErrors: true,
  });
  try {
    const page = await context.newPage();
    await page.goto("https://localhost:4173");
    await ready(page);
    await cache(page);
    const session = await context.newCDPSession(page);
    const result = await session.send("Page.getInstallabilityErrors");
    expect(result.installabilityErrors).toEqual([]);
    await session.detach();
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
