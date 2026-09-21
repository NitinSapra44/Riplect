import { defineConfig, devices } from "@playwright/test";

/**
 * Base URL resolution:
 *  - CI / custom env:  PLAYWRIGHT_BASE_URL overrides everything
 *  - Replit (local):   the dev-server always binds to localhost:5000
 *
 * We intentionally use http://localhost:5000 so Playwright (running inside
 * the same container) can reach the Express+Vite server directly without
 * going through the Replit mTLS proxy.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5000";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath:
            process.env.CHROMIUM_PATH ||
            "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        },
      },
    },
  ],
});
