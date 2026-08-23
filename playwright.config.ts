import { defineConfig, devices } from "@playwright/test";

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
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
  },
  /**
   * Tests run against the production build, not the dev server.
   *
   * `vinext dev` compiles on demand, and under parallel workers it competes for
   * CPU with the browsers driving it. Measured on an 8-core machine: the same
   * suite was 12 failed / 3 passed in 3.7 min against dev, and 15 passed in
   * 20.6 s against the built output. The dev server was not erroring on its own
   * account — it was logging `GET /?scene=home 500 in 61.3s (render: 46.7s)`,
   * i.e. a render starved of CPU rather than a routing or asset fault.
   *
   * Set PW_DEV_SERVER=1 to run against `npm run dev` instead, which keeps the
   * fast edit-reload loop when debugging a test.
   */
  webServer: {
    command: process.env.PW_DEV_SERVER ? "npm run dev" : "npm run build && npm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    // Now covers a production build, not just a dev boot.
    timeout: process.env.PW_DEV_SERVER ? 120_000 : 240_000,
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
