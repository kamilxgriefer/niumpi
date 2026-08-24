import { defineConfig, devices } from "@playwright/test";

/*
 * Port 3000 is not always ours — a tunnel or another project can hold it, and
 * a suite that can only run on one hardcoded port simply refuses to start.
 * PW_PORT moves the whole harness together.
 */
const PORT = process.env.PW_PORT ?? "3000";
const ORIGIN = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: ORIGIN,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
  },
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: ORIGIN,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
});
