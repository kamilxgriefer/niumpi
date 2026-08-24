import { expect, test, type Page } from "@playwright/test";

const SAVE_KEY = "niumpi-save-v6";

async function seed(page: Page, value: unknown) {
  await page.addInitScript(([key, save]) => {
    window.localStorage.clear();
    window.localStorage.setItem(key as string, JSON.stringify(save));
  }, [SAVE_KEY, value]);
}

function hatchedSave(name = "Mango", stage = 2) {
  const now = 1787000000000;
  return {
    version: 5,
    profile: { id: "frame-e2e", createdAt: now, lastSeenAt: now, settings: { reducedMotion: "off" } },
    niumpi: {
      name, createdAt: now, hatchedAt: now, seedProgress: 1, stage,
      stageStartedAt: now, careMoments: 80, bond: 55, lastInteractionAt: now,
    },
    inventory: {
      ingredients: { moonberry: 4 }, items: [],
      currencies: { dewdrops: 100, starFragments: 3 },
    },
    unlocks: ["seeds", "room", "games", "garden", "shop"],
  };
}

test("animation lab advances real atlas frames and switches clips on desktop and mobile", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/?animation-lab=1", { waitUntil: "domcontentloaded" });
    const canvas = page.locator(".animation-lab-stage canvas");
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await expect(canvas).toHaveAttribute("data-clip", "idle", { timeout: 30_000 });
    const first = Number(await canvas.getAttribute("data-frame"));
    await page.waitForTimeout(260);
    const second = Number(await canvas.getAttribute("data-frame"));
    expect(second).not.toBe(first);

    await page.getByRole("button", { name: "tap reaction" }).click();
    await expect(canvas).toHaveAttribute("data-clip", "tap_reaction");
    await expect(page.locator(".animation-lab-stats")).toContainText("24");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
  }
  expect(errors).toEqual([]);
});

test("the gameplay tap requests the protected full-frame reaction clip", async ({ page }) => {
  await seed(page, hatchedSave());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const canvas = page.locator(".rig-root canvas.nb-frame-canvas");
  await expect(canvas).toHaveAttribute("data-clip", "idle", { timeout: 30_000 });
  await page.getByRole("button", { name: "Pet Mango" }).click();
  await expect(canvas).toHaveAttribute("data-clip", "tap_reaction", { timeout: 5_000 });
  await expect.poll(async () => Number(await canvas.getAttribute("data-frame"))).toBeGreaterThan(0);
  await expect.poll(async () => canvas.getAttribute("data-clip"), { timeout: 3_000 }).toBe("idle");
  // The controller still moves through recovery after the one-second drawing
  // completes. A phase-only mutation must not replay the reaction.
  await page.waitForTimeout(800);
  await expect(canvas).toHaveAttribute("data-clip", "idle");
});

test("reduced motion keeps the approved portrait in standalone views", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?animation-lab=1", { waitUntil: "domcontentloaded" });
  const player = page.locator(".animation-lab-stage .nb-frame-player");
  await expect(player).toHaveClass(/is-reduced/);
  await expect(player.locator(".nb-frame-fallback")).toBeVisible();
  await expect(player.locator(".nb-frame-canvas")).toBeHidden();
});

test("the first post-hatch appearance plays enter before settling into idle", async ({ page }) => {
  await seed(page, hatchedSave("", 1));
  await page.goto("/?scene=seed", { waitUntil: "domcontentloaded" });
  const canvas = page.locator(".hatch-baby canvas.nb-frame-canvas");
  await expect(canvas).toHaveAttribute("data-clip", "hatch_complete", { timeout: 30_000 });
  await expect.poll(async () => canvas.getAttribute("data-clip"), { timeout: 4_000 }).toBe("idle");
});
