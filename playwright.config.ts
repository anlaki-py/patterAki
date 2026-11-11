import { defineConfig } from "@playwright/test";
import { execFileSync } from "node:child_process";
import process from "node:process";

function installedChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  for (const name of ["chromium-browser", "chromium", "google-chrome"]) {
    try {
      return execFileSync("which", [name], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      /* Try the next installed executable. */
    }
  }
  throw new Error(
    "Set CHROMIUM_PATH to an installed Chromium executable to run browser tests.",
  );
}
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "https://localhost:5173",
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 },
    launchOptions: {
      executablePath: installedChromium(),
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    },
  },
  webServer: {
    command: "npm run dev",
    url: "https://localhost:5173",
    ignoreHTTPSErrors: true,
    reuseExistingServer: true,
  },
});
