import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
export default defineConfig({
  define: { __PWA_BUILD__: JSON.stringify(String(Date.now())) },
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: [
        "favicon.svg",
        "icon-192.png",
        "icon-512.png",
        "apple-touch-icon.png",
      ],
      manifest: {
        name: "PatternAki",
        short_name: "PatternAki",
        description: "Offline sewing pattern drafting in millimetres",
        start_url: "./",
        scope: "./",
        display: "standalone",
        theme_color: "#1971c2",
        background_color: "#ffffff",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-maskable.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      strategies: "injectManifest",
      srcDir: "src/app",
      filename: "sw.ts",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        maximumFileSizeToCacheInBytes: 5_000_000,
        rollupFormat: "iife",
      },
    }),
  ],
  server: { host: "0.0.0.0", port: 5173, strictPort: true },
  test: { environment: "node" },
});
