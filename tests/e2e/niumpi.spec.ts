import { expect, test, type Page } from "@playwright/test";

const STORAGE_KEYS = ["niumpi-memory-v1", "niumpi-memory-v2"];

async function openFreshGame(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate((keys) => {
    for (const key of keys) window.localStorage.removeItem(key);
  }, STORAGE_KEYS);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Pet Niumpi" })).toBeVisible();
}

test("loads the core care interface without browser errors", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await openFreshGame(page);

  await expect(page).toHaveTitle(/Niumpi/i);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByLabel("Niumpi's room")).toBeVisible();
  await expect(page.getByLabel("Niumpi's needs")).toBeVisible();
  await expect(page.getByLabel("Food tray")).toBeVisible();
  await expect(page.getByRole("button", { name: "Touch Niumpi's leaf" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sound on" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Lamp on" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tuck in" })).toBeVisible();

  expect(browserErrors).toEqual([]);
});

test("petting Niumpi updates and persists the shared memory", async ({ page }) => {
  await openFreshGame(page);

  await page.getByRole("button", { name: "Pet Niumpi" }).click();
  await expect(page.locator(".memory-note")).toContainText("1 shared moments");

  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem("niumpi-memory-v2");
        if (!raw) return 0;
        return JSON.parse(raw).interactions?.tap ?? 0;
      }),
    )
    .toBe(1);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".memory-note")).toContainText("1 shared moments");
});

test("sound, lamp and sleep controls expose their current state", async ({ page }) => {
  await openFreshGame(page);

  const sound = page.locator(".sound-toggle");
  await expect(sound).toHaveAttribute("aria-pressed", "true");
  await expect(sound).toHaveText("Sound on");
  await sound.click();
  await expect(sound).toHaveAttribute("aria-pressed", "false");
  await expect(sound).toHaveText("Sound off");

  const lamp = page.locator(".room-controls button").first();
  await expect(lamp).toHaveAttribute("aria-pressed", "false");
  await expect(lamp).toContainText("Lamp on");
  await lamp.click();
  await expect(lamp).toHaveAttribute("aria-pressed", "true");
  await expect(lamp).toContainText("Lamp off");

  const sleep = page.locator(".room-controls button").nth(1);
  await expect(sleep).toContainText("Tuck in");
  await sleep.click();
  await expect(sleep).toContainText("Wake gently");
  await expect(page.locator(".speech")).toContainText(/good night|Zzz/i);

  await sleep.click();
  await expect(sleep).toContainText("Tuck in");
  await expect(page.locator(".speech")).toContainText("Good morning");
});

test("dragging a Moonberry to Niumpi feeds the companion", async ({ page }) => {
  await openFreshGame(page);

  const food = page.getByRole("button", { name: "Drag Moonberry to Niumpi" });
  const niumpi = page.getByRole("button", { name: "Pet Niumpi" });
  await food.scrollIntoViewIfNeeded();

  const foodBox = await food.boundingBox();
  const niumpiBox = await niumpi.boundingBox();
  expect(foodBox).not.toBeNull();
  expect(niumpiBox).not.toBeNull();
  if (!foodBox || !niumpiBox) return;

  await page.mouse.move(foodBox.x + foodBox.width / 2, foodBox.y + foodBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    niumpiBox.x + niumpiBox.width / 2,
    niumpiBox.y + niumpiBox.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();

  await expect(page.locator(".speech")).toContainText("Moonberry is delicious");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem("niumpi-memory-v2");
        if (!raw) return 0;
        return JSON.parse(raw).foods?.moonberry ?? 0;
      }),
    )
    .toBe(1);
});

test("the core game remains usable on a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFreshGame(page);

  await expect(page.getByRole("button", { name: "Pet Niumpi" })).toBeVisible();
  await expect(page.getByLabel("Niumpi's needs")).toBeVisible();
  await expect(page.getByLabel("Food tray")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tuck in" })).toBeVisible();

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(2);
});
