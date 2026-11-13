import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  outputDir: "test-results-pwa",
  testMatch: "**/*.pwa.ts",
  timeout: 120000,
  use: {
    ...base.use,
    baseURL: "https://localhost:4173",
    launchOptions: {
      ...base.use?.launchOptions,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--ignore-certificate-errors",
      ],
    },
  },
  webServer: {
    command: "npm exec vite -- preview --host 0.0.0.0 --port 4173 --strictPort",
    url: "https://localhost:4173",
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
  },
});
