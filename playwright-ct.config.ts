import { defineConfig, devices } from "@playwright/experimental-ct-react";
import path from "path";
import { fileURLToPath } from "url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: "./tests/ct",
  snapshotDir: "./tests/ct/__snapshots__",
  use: {
    baseURL: "http://127.0.0.1:34000",
    ctPort: 34000,
    viewport: { width: 1280, height: 720 },
    ctViteConfig: {
      resolve: {
        alias: {
          "@": path.resolve(dirname, "./src"),
        },
      },
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
