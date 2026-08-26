import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  NIUMPI_AVAILABLE_MODEL_VARIANTS,
  type NiumpiModelVariant,
  variantFor,
} from "../../app/anim/NiumpiModelVariants.ts";
import { NIUMPI_SPRITE_CLIPS } from "../../app/anim/NiumpiSpriteRuntime.ts";
import type { RouteId } from "../../app/game/types.ts";

const SAVE_KEY = "niumpi-save-v6";
const PROOF_ROOT = join(process.cwd(), "artifacts/niumpi-animation-proof/gate-d-variants");
mkdirSync(PROOF_ROOT, { recursive: true });
const ROUTE_VARIANTS = new Set<RouteId>([
  "moonveil", "bloomheart", "sparkleap", "mistwander", "prismatic",
]);
const NEW_GATE_VARIANTS = new Set<NiumpiModelVariant>([
  "stage-3", "stage-4", "moonveil", "bloomheart", "sparkleap", "prismatic",
]);

function progressForVariant(variant: NiumpiModelVariant) {
  if (variant === "baby") return { stage: 1, morphology: "seedling" as const, lockedRoute: null };
  if (variant.startsWith("stage-")) {
    return { stage: Number(variant.slice(6)), morphology: "seedling" as const, lockedRoute: null };
  }
  const route = variant as RouteId;
  if (!ROUTE_VARIANTS.has(route)) throw new Error(`No gameplay fixture for declared variant ${variant}`);
  return { stage: 5, morphology: route, lockedRoute: route };
}

function saveForVariant(variant: NiumpiModelVariant) {
  const now = 1787000000000;
  const progress = progressForVariant(variant);
  const selected = variantFor(progress.stage, progress.morphology, progress.lockedRoute);
  if (selected !== variant) throw new Error(`Fixture for ${variant} resolves to ${selected}`);
  return {
    version: 5,
    profile: {
      id: `variant-gate-${variant}`,
      createdAt: now,
      lastSeenAt: now,
      settings: { reducedMotion: "off" },
    },
    niumpi: {
      name: "Mango",
      createdAt: now,
      hatchedAt: now,
      seedProgress: 1,
      stage: progress.stage,
      stageStartedAt: now,
      careMoments: 0,
      bond: 55,
      lastInteractionAt: now,
    },
    evolution: {
      vectors: { play: 0, rest: 0, explore: 0, affection: 0, care: 0 },
      lockedRoute: progress.lockedRoute,
      routeConfidence: progress.lockedRoute ? 1 : 0,
      history: [],
    },
    phenotype: {
      bodyPalette: progress.lockedRoute ?? "cloud",
      bellyPalette: progress.lockedRoute ? `${progress.lockedRoute}-belly` : "pearl",
      leafShape: "sprout",
      leafPalette: "mint",
      leafCount: progress.stage >= 4 ? 5 : progress.stage,
      markings: [],
      eyeType: "round",
      morphology: progress.morphology,
      aura: null,
      particles: null,
      accessory: null,
      tints: {},
    },
    personality: {
      favoriteFoods: ["moonberry"],
      dislikedFoods: [],
      favoriteToy: null,
      traits: {},
      signals: {},
      talents: { cooking: 0, music: 0, gardening: 0, agility: 0, exploration: 0, storytelling: 0 },
    },
    inventory: {
      ingredients: { moonberry: 4 },
      items: [],
      currencies: { dewdrops: 100, starFragments: 3 },
    },
    unlocks: ["seeds", "room", "games", "garden", "shop"],
  };
}

async function seed(page: Page, variant: NiumpiModelVariant) {
  const save = saveForVariant(variant);
  await page.addInitScript(([key, value]) => {
    window.localStorage.clear();
    window.localStorage.setItem(key as string, JSON.stringify(value));
  }, [SAVE_KEY, save]);
}

function captureRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function expectReadyCanvas(page: Page, variant: NiumpiModelVariant) {
  const player = page.locator(`.rig-root .nb-frame-player[data-variant="${variant}"]`).first();
  const canvas = player.locator("canvas.nb-frame-canvas");
  await expect(player).not.toHaveClass(/is-error|is-loading/, { timeout: 30_000 });
  await expect(player.locator(".nb-frame-fallback")).toBeHidden();
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-renderer", /^sprite-atlas-v[23]$/);
  await expect(canvas).toHaveAttribute("data-schema-version", /^[23]$/);
  expect(await canvas.getAttribute("data-renderer"))
    .toBe(`sprite-atlas-v${await canvas.getAttribute("data-schema-version")}`);
  await expect(canvas).toHaveAttribute("data-variant", variant);
  await expect(canvas).toHaveAttribute("data-motion-gate", "PASS");
  await expect(canvas).not.toHaveAttribute("data-error", /.+/);
  await expect(canvas).not.toHaveAttribute("data-missing-semantic-clip", /.+/);
  await expect.poll(async () => {
    const local = Number(await canvas.getAttribute("data-decoded-bytes"));
    const localBudget = Number(await canvas.getAttribute("data-decoded-budget"));
    const global = Number(await canvas.getAttribute("data-global-decoded-bytes"));
    const globalBudget = Number(await canvas.getAttribute("data-global-decoded-budget"));
    return Number.isFinite(local) && Number.isFinite(localBudget) && local <= localBudget
      && Number.isFinite(global) && Number.isFinite(globalBudget) && global <= globalBudget;
  }, { timeout: 10_000 }).toBe(true);
  return { player, canvas };
}

async function capture(page: Page, name: string) {
  await page.screenshot({ path: join(PROOF_ROOT, name), animations: "allow" });
}

test.describe.configure({ mode: "serial" });
test.use({ video: process.env.NIUMPI_GATE_VIDEO === "1" ? "on" : "retain-on-failure" });

for (const variant of NIUMPI_AVAILABLE_MODEL_VARIANTS) {
  test(`${variant} passes the real-game production animation gate`, async ({ page }) => {
    test.setTimeout(45_000);
    const errors = captureRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await seed(page, variant);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const { canvas } = await expectReadyCanvas(page, variant);
    await expect(canvas).toHaveAttribute("data-clip", "idle", { timeout: 30_000 });
    const firstIdleFrame = Number(await canvas.getAttribute("data-frame"));
    await expect.poll(async () => Number(await canvas.getAttribute("data-frame"))).not.toBe(firstIdleFrame);
    if (variant !== "baby") await capture(page, `${variant}-desktop-idle.png`);

    const root = page.locator(".rig-root").first();
    await root.evaluate((element) => element.classList.add("is-blinking"));
    await expect(canvas).toHaveAttribute("data-clip", "blink");
    await root.evaluate((element) => element.classList.remove("is-blinking"));
    await expect(canvas).toHaveAttribute("data-clip", "idle", { timeout: 8_000 });

    // Use the real room interaction so the production controller owns the
    // motion token and clock. Direct DOM mutation can be overwritten before a
    // cold atlas finishes decoding and is not a gameplay path.
    await page.getByRole("button", { name: "Window", exact: true }).click();
    await expect(root).toHaveAttribute("data-anim", "look");
    await expect(root).toHaveAttribute("data-gaze-target-x", "14");
    await expect(canvas).toHaveAttribute("data-clip", "look_right", { timeout: 5_000 });
    if (NEW_GATE_VARIANTS.has(variant)) await capture(page, `${variant}-desktop-look-right.png`);
    await expect(canvas).toHaveAttribute("data-clip", "idle", { timeout: 8_000 });

    await page.getByRole("button", { name: "Pet Mango" }).click();
    await expect(canvas).toHaveAttribute("data-clip", "tap_reaction", { timeout: 5_000 });
    await expect(canvas).toHaveAttribute("data-clip", "idle", { timeout: 8_000 });

    const readMoonberries = () => page.evaluate((key) => {
      const saved = JSON.parse(window.localStorage.getItem(key) ?? "{}");
      return Number(saved.inventory?.ingredients?.moonberry);
    }, SAVE_KEY);
    await expect.poll(readMoonberries).toBeGreaterThan(0);
    const ingredientsBeforeFeed = await readMoonberries();
    await page.locator(".snack-card").filter({ hasText: "Moonberry" }).click();
    await page.getByRole("button", { name: "Feed", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-clip", "eat", { timeout: 5_000 });
    await expect.poll(async () => Number(await canvas.getAttribute("data-food-bites")), { timeout: 6_000 }).toBe(3);
    if (variant !== "baby") await capture(page, `${variant}-desktop-eat-bite3.png`);
    await expect(canvas).toHaveAttribute("data-clip", "happy", { timeout: 7_000 });
    if (variant !== "baby") await capture(page, `${variant}-desktop-happy.png`);
    await expect(canvas).toHaveAttribute("data-clip", "idle", { timeout: 8_000 });
    await expect.poll(readMoonberries).toBe(ingredientsBeforeFeed - 1);
    await page.waitForTimeout(300);
    expect(await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").inventory?.ingredients?.moonberry, SAVE_KEY)).toBe(ingredientsBeforeFeed - 1);

    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
    await expect(canvas).toHaveAttribute("data-variant", variant);
    await expect(canvas).not.toHaveAttribute("data-fallback", /.+/);
    expect(errors).toEqual([]);
  });
}

const RESPONSIVE_VARIANTS = [
  "baby", "stage-4", "sparkleap", "mistwander", "prismatic",
] as const satisfies readonly (typeof NIUMPI_AVAILABLE_MODEL_VARIANTS)[number][];

for (const variant of RESPONSIVE_VARIANTS) {
  test(`${variant} stays production-ready at the representative mobile viewport`, async ({ page }) => {
    const errors = captureRuntimeErrors(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page, variant);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const { canvas } = await expectReadyCanvas(page, variant);
    await expect(canvas).toHaveAttribute("data-clip", "idle", { timeout: 30_000 });
    await capture(page, `${variant}-mobile-idle.png`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
    expect(errors).toEqual([]);
  });
}

test("Animation Lab exposes every and only the manifests declared available", async ({ page }) => {
  const errors = captureRuntimeErrors(page);
  await page.goto("/?animation-lab=1", { waitUntil: "domcontentloaded" });
  const select = page.locator(".animation-lab-panel select").first();
  await expect(select.locator("option")).toHaveText([...NIUMPI_AVAILABLE_MODEL_VARIANTS]);
  for (const variant of NIUMPI_AVAILABLE_MODEL_VARIANTS) {
    await select.selectOption(variant);
    const player = page.locator(`.animation-lab-stage .nb-frame-player[data-variant="${variant}"]`);
    await expect(player).not.toHaveClass(/is-error|is-loading/, { timeout: 30_000 });
    const canvas = player.locator("canvas.nb-frame-canvas");
    await expect(canvas).toHaveAttribute("data-variant", variant);
    await expect(canvas).not.toHaveAttribute("data-error", /.+/);
    await expect(player.locator(".nb-frame-fallback")).toBeHidden();
    const manifest = JSON.parse(readFileSync(join(process.cwd(), "public/assets/niumpi/v2", variant, "manifest.json"), "utf8"));
    const expectedClips = NIUMPI_SPRITE_CLIPS
      .filter((name) => Boolean(manifest.clips[name]))
      .map((name) => name.replaceAll("_", " "));
    await expect(page.locator(".animation-lab-buttons button")).toHaveText(expectedClips);
  }
  expect(errors).toEqual([]);
});
