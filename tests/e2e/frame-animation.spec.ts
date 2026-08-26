import { expect, test, type Page } from "@playwright/test";
import {
  NIUMPI_AVAILABLE_MODEL_VARIANTS,
  NIUMPI_SUPPORTED_MODEL_VARIANTS,
} from "../../app/anim/NiumpiModelVariants.ts";

const SAVE_KEY = "niumpi-save-v6";

async function seed(page: Page, value: unknown) {
  await page.addInitScript(([key, save]) => {
    window.localStorage.clear();
    window.localStorage.setItem(key as string, JSON.stringify(save));
  }, [SAVE_KEY, value]);
}

function hatchedSave(name = "Mango", stage = 1) {
  const now = 1787000000000;
  return {
    version: 5,
    profile: { id: "frame-e2e", createdAt: now, lastSeenAt: now, settings: { reducedMotion: "off" } },
    niumpi: {
      name, createdAt: now, hatchedAt: now, seedProgress: 1, stage,
      stageStartedAt: now, careMoments: 0, bond: 55, lastInteractionAt: now,
    },
    inventory: {
      ingredients: { moonberry: 4 }, items: [],
      currencies: { dewdrops: 100, starFragments: 3 },
    },
    unlocks: ["seeds", "room", "games", "garden", "shop"],
  };
}

test("animation lab uses the production atlas player and exposes frame-proof controls on desktop and mobile", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/?animation-lab=1", { waitUntil: "domcontentloaded" });
    const canvas = page.locator(".animation-lab-stage canvas");
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await expect(canvas).toHaveAttribute("data-renderer", /^sprite-atlas-v[23]$/, { timeout: 30_000 });
    await expect(canvas).toHaveAttribute("data-schema-version", /^[23]$/);
    expect(await canvas.getAttribute("data-renderer"))
      .toBe(`sprite-atlas-v${await canvas.getAttribute("data-schema-version")}`);
    await expect(canvas).toHaveAttribute("data-clip", "idle", { timeout: 30_000 });
    await expect.poll(async () => {
      const used = Number(await canvas.getAttribute("data-decoded-bytes"));
      const budget = Number(await canvas.getAttribute("data-decoded-budget"));
      return Number.isFinite(used) && Number.isFinite(budget) && used <= budget;
    }).toBe(true);
    const first = Number(await canvas.getAttribute("data-frame"));
    await page.waitForTimeout(260);
    const second = Number(await canvas.getAttribute("data-frame"));
    expect(second).not.toBe(first);

    await page.getByRole("button", { name: "tap reaction", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-clip", "tap_reaction");
    await expect(page.locator(".animation-lab-stats")).toContainText("24");
    await expect(canvas).toHaveAttribute("data-motion-gate", "PASS");
    await page.getByRole("button", { name: "Pause" }).click();
    await page.waitForTimeout(80);
    const paused = Number(await canvas.getAttribute("data-frame"));
    await page.waitForTimeout(180);
    expect(Number(await canvas.getAttribute("data-frame"))).toBe(paused);
    await page.getByRole("button", { name: "Next frame" }).click();
    await expect.poll(async () => Number(await canvas.getAttribute("data-frame"))).toBe(Math.min(paused + 1, Number(await canvas.getAttribute("data-total-frames")) - 1));
    await page.getByLabel("Show foot anchor").check();
    await expect(page.locator(".nb-frame-anchor")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
  }
  expect(errors).toEqual([]);
});

test("mobile Friends admits one live Canvas and keeps global decoded retention inside 96 MiB", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const save = hatchedSave();
  await seed(page, { ...save, unlocks: [...save.unlocks, "friends"] });
  await page.goto("/?scene=friends", { waitUntil: "domcontentloaded" });
  const cards = page.locator(".friend-card");
  await expect(cards).toHaveCount(3);
  await expect(page.locator(".friend-avatar canvas.nb-frame-canvas")).toHaveCount(1);
  await expect(page.locator('.friend-avatar [data-renderer="approved-still"]')).toHaveCount(2);
  const live = page.locator(".friend-avatar canvas.nb-frame-canvas");
  await expect(live).toHaveAttribute("data-renderer", /^sprite-atlas-v[23]$/, { timeout: 30_000 });
  await expect(live).toHaveAttribute("data-schema-version", /^[23]$/);
  await expect.poll(async () => {
    const retained = Number(await live.getAttribute("data-global-decoded-bytes"));
    const budget = Number(await live.getAttribute("data-global-decoded-budget"));
    return Number.isFinite(retained) && Number.isFinite(budget) && retained <= budget;
  }, { timeout: 10_000 }).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
});

test("an unshipped growth variant keeps its approved still and is not offered in Lab", async ({ page }) => {
  const missingVariant = NIUMPI_SUPPORTED_MODEL_VARIANTS.find(
    (variant) => !NIUMPI_AVAILABLE_MODEL_VARIANTS.includes(variant as (typeof NIUMPI_AVAILABLE_MODEL_VARIANTS)[number]),
  );
  if (!missingVariant) {
    await page.goto("/?animation-lab=1", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".animation-lab-panel select option")).toHaveCount(NIUMPI_AVAILABLE_MODEL_VARIANTS.length);
    return;
  }
  const missingStage = missingVariant.startsWith("stage-") ? Number(missingVariant.slice(6)) : 5;
  const missingSave = hatchedSave("Mango", missingStage);
  const route = missingVariant.startsWith("stage-") ? null : missingVariant;
  await seed(page, route ? {
    ...missingSave,
    evolution: {
      vectors: { play: 0, rest: 0, explore: 0, affection: 0, care: 0 },
      lockedRoute: route,
      routeConfidence: 1,
      history: [],
    },
    phenotype: { morphology: route },
  } : missingSave);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const player = page.locator(`.rig-root .nb-frame-player[data-variant="${missingVariant}"]`);
  const canvas = player.locator("canvas.nb-frame-canvas");
  await expect(player).toHaveClass(/is-error/, { timeout: 30_000 });
  const fallback = missingVariant.startsWith("stage-")
    ? `/assets/niumpi/stages/${missingVariant}.webp`
    : `/assets/niumpi/forms/${missingVariant}.webp`;
  await expect(player.locator(".nb-frame-fallback")).toHaveAttribute("src", fallback);
  await expect(player.locator(".nb-frame-fallback")).toBeVisible();
  await expect(canvas).toBeHidden();
  expect(await canvas.getAttribute("data-renderer")).toBeNull();
  expect(await canvas.getAttribute("data-requested-variant")).toBe(missingVariant);

  await page.goto("/?animation-lab=1", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".animation-lab-panel select option")).toHaveText([...NIUMPI_AVAILABLE_MODEL_VARIANTS]);
});

test("the gameplay tap requests the protected production sprite reaction", async ({ page }) => {
  await seed(page, hatchedSave());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const canvas = page.locator(".rig-root canvas.nb-frame-canvas");
  await expect(canvas).toHaveAttribute("data-clip", "idle", { timeout: 30_000 });
  await page.getByRole("button", { name: "Pet Mango" }).click();
  await expect(canvas).toHaveAttribute("data-clip", "tap_reaction", { timeout: 5_000 });
  await expect.poll(async () => Number(await canvas.getAttribute("data-frame"))).toBeGreaterThan(0);
  await expect.poll(async () => canvas.getAttribute("data-clip"), { timeout: 8_000 }).not.toBe("tap_reaction");
  // The controller still moves through recovery after the reaction
  // completes. A phase-only mutation must not replay the reaction.
  await page.waitForTimeout(800);
  await expect.poll(async () => canvas.getAttribute("data-clip")).not.toBe("tap_reaction");
});

test("a favourite feed plays eat then happy once before returning to idle", async ({ page }) => {
  await seed(page, {
    ...hatchedSave(),
    personality: {
      favoriteFoods: ["moonberry"], dislikedFoods: [], favoriteToy: null,
      traits: {}, signals: {},
      talents: { cooking: 0, music: 0, gardening: 0, agility: 0, exploration: 0, storytelling: 0 },
    },
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const canvas = page.locator(".rig-root canvas.nb-frame-canvas");
  await expect(canvas).toHaveAttribute("data-clip", "idle", { timeout: 30_000 });
  await canvas.evaluate((element) => {
    const history: string[] = [];
    (window as typeof window & { __niumpiClipHistory?: string[] }).__niumpiClipHistory = history;
    const record = () => {
      const clip = (element as HTMLElement).dataset.clip;
      if (clip && history.at(-1) !== clip) history.push(clip);
    };
    record();
    new MutationObserver(record).observe(element, { attributes: true, attributeFilter: ["data-clip"] });
  });

  await page.locator(".snack-card").filter({ hasText: "Moonberry" }).click();
  await page.getByRole("button", { name: "Feed", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-clip", "eat", { timeout: 5_000 });
  await expect(canvas).toHaveAttribute("data-clip", "happy", { timeout: 6_000 });
  await expect(canvas).toHaveAttribute("data-clip", "idle", { timeout: 5_000 });
  const history = await page.evaluate(() => (window as typeof window & { __niumpiClipHistory?: string[] }).__niumpiClipHistory ?? []);
  expect(history.filter((clip) => clip === "eat")).toHaveLength(1);
  expect(history).toEqual(expect.arrayContaining(["eat", "happy", "idle"]));
});

test("a required atlas stalled beyond the action duration resumes at frame zero without bite bursts", async ({ page }) => {
  let releasePage!: () => void;
  let markIntercepted!: () => void;
  const intercepted = new Promise<void>((resolve) => { markIntercepted = resolve; });
  const holdPage = new Promise<void>((resolve) => { releasePage = resolve; });
  let held = false;
  await page.route(/\/assets\/niumpi\/v2\/baby\/atlases\/eat-[^/]+\.webp(?:\?.*)?$/, async (route) => {
    if (!held) {
      held = true;
      markIntercepted();
      await holdPage;
    }
    await route.continue();
  });
  await seed(page, hatchedSave());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const root = page.locator(".rig-root").first();
  const canvas = root.locator("canvas.nb-frame-canvas");
  await expect(canvas).toHaveAttribute("data-clip", "idle", { timeout: 30_000 });
  await page.locator(".snack-card").filter({ hasText: "Moonberry" }).click();
  await page.getByRole("button", { name: "Feed", exact: true }).click();
  await intercepted;
  await expect(root).toHaveAttribute("data-anim", "eat", { timeout: 3_000 });
  await expect(canvas).toHaveAttribute("data-suspended-by", /atlas/);
  await expect(root).toHaveAttribute("data-anim", "idle", { timeout: 10_000 });

  await canvas.evaluate((element) => {
    const frames: number[] = [];
    (window as typeof window & { __niumpiResumeFrames?: number[] }).__niumpiResumeFrames = frames;
    new MutationObserver(() => {
      const node = element as HTMLElement;
      const frame = Number(node.dataset.frame);
      if (node.dataset.clip === "eat" && Number.isFinite(frame) && frames.at(-1) !== frame) frames.push(frame);
    }).observe(element, { attributes: true, attributeFilter: ["data-frame"] });
  });
  releasePage();
  await expect(canvas).toHaveAttribute("data-clip", "eat", { timeout: 10_000 });
  await expect.poll(async () => page.evaluate(
    () => (window as typeof window & { __niumpiResumeFrames?: number[] }).__niumpiResumeFrames?.[0] ?? -1,
  )).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(
    () => (window as typeof window & { __niumpiResumeFrames?: number[] }).__niumpiResumeFrames?.[0] ?? -1,
  )).toBeLessThanOrEqual(3);
  expect(Number(await canvas.getAttribute("data-food-bites"))).toBe(0);
  await expect.poll(async () => Number(await canvas.getAttribute("data-food-bites")), { timeout: 6_000 }).toBe(3);
});

test("eat draws a concrete food prop through three bites and removes it after swallow", async ({ page }) => {
  await page.goto("/?animation-lab=1", { waitUntil: "domcontentloaded" });
  const canvas = page.locator(".animation-lab-stage canvas");
  await expect(canvas).toHaveAttribute("data-renderer", /^sprite-atlas-v[23]$/, { timeout: 30_000 });
  await expect(canvas).toHaveAttribute("data-schema-version", /^[23]$/);
  await page.getByRole("button", { name: "eat", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-clip", "eat", { timeout: 15_000 });
  await expect(canvas).toHaveAttribute("data-food-prop", "moonberry");
  await expect.poll(async () => Number(await canvas.getAttribute("data-decoded-bytes")))
    .toBeLessThanOrEqual(Number(await canvas.getAttribute("data-decoded-budget")));
  // `data-food-bites` is cumulative from the manifest's three ordered bite
  // events. Reaching 3 proves all beats occurred even on a busy CI machine
  // that cannot sample each ~580ms intermediate state.
  await expect.poll(async () => Number(await canvas.getAttribute("data-food-bites")), { timeout: 5_000 }).toBe(3);
  await expect(canvas).toHaveAttribute("data-food-prop", "none", { timeout: 4_000 });
});

test("scheduled blinks reach the sprite player even without a behavior token change", async ({ page }) => {
  await seed(page, hatchedSave());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const root = page.locator(".rig-root").first();
  const canvas = root.locator("canvas.nb-frame-canvas");
  await expect(canvas).toHaveAttribute("data-clip", "idle", { timeout: 30_000 });
  await root.evaluate((element) => element.classList.add("is-blinking"));
  await expect(canvas).toHaveAttribute("data-clip", "blink");
  await root.evaluate((element) => element.classList.remove("is-blinking"));
  // The first assertion is the integration proof. Depending on when the
  // polling loop observed the 500ms clip, its authored recovery may already
  // be near completion when the controller removes the short-lived class.
  await expect.poll(async () => canvas.getAttribute("data-clip"), { timeout: 8_000 }).not.toBe("blink");
});

test("a real semantic look from the room window plays its directed clip then returns idle", async ({ page }) => {
  await seed(page, hatchedSave());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const root = page.locator(".rig-root").first();
  const canvas = root.locator("canvas.nb-frame-canvas");
  await expect(canvas).toHaveAttribute("data-clip", "idle", { timeout: 30_000 });
  await page.getByRole("button", { name: "Window", exact: true }).click();
  await expect(root).toHaveAttribute("data-anim", "look");
  await expect(root).toHaveAttribute("data-gaze-target-x", "14");
  await expect(canvas).toHaveAttribute("data-clip", "look_right", { timeout: 5_000 });
  await expect(canvas).toHaveAttribute("data-clip", "idle", { timeout: 8_000 });
});

test("idle waits until an authored non-looping performance reaches recovery", async ({ page }) => {
  await seed(page, hatchedSave());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const root = page.locator(".rig-root").first();
  const canvas = root.locator("canvas.nb-frame-canvas");
  await expect(canvas).toHaveAttribute("data-clip", "idle", { timeout: 30_000 });
  await root.evaluate((element) => {
    (element as HTMLElement).dataset.anim = "happy";
    (element as HTMLElement).dataset.motionToken = "e2e-happy";
  });
  await expect(canvas).toHaveAttribute("data-clip", "happy");
  const recoveryGate = Math.floor(Number(await canvas.getAttribute("data-total-frames")) * 0.6);
  // Recovery is requested immediately, just as a gameplay controller may
  // request it before the authored performance has finished.
  await root.evaluate((element) => {
    (element as HTMLElement).dataset.anim = "idle";
    (element as HTMLElement).dataset.motionToken = "e2e-idle";
  });
  await expect.poll(async () => {
    if (await canvas.getAttribute("data-clip") !== "happy") return -1;
    return Number(await canvas.getAttribute("data-frame"));
  }, { timeout: 5_000 }).toBeGreaterThan(recoveryGate);
  // A scheduled blink may legitimately be the first ambient performance after
  // recovery, so assert that the protected clip completes rather than racing
  // one exact idle substate.
  await expect.poll(async () => canvas.getAttribute("data-clip"), { timeout: 5_000 }).not.toBe("happy");
});

test("reduced motion renders an authored atlas pose without ambient playback or fallback", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?animation-lab=1", { waitUntil: "domcontentloaded" });
  const player = page.locator(".animation-lab-stage .nb-frame-player");
  const canvas = player.locator(".nb-frame-canvas");
  await expect(player).toHaveClass(/is-reduced/);
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(canvas).toHaveAttribute("data-renderer", /^sprite-atlas-v[23]$/);
  await expect(canvas).toHaveAttribute("data-schema-version", /^[23]$/);
  await expect(canvas).toHaveAttribute("data-motion-mode", "reduced");
  await expect(player.locator(".nb-frame-fallback")).toBeHidden();
  const frame = await canvas.getAttribute("data-frame");
  await page.waitForTimeout(500);
  expect(await canvas.getAttribute("data-frame")).toBe(frame);
  expect(await canvas.getAttribute("data-clip")).toBe("idle");
});

test("the first post-hatch appearance plays enter before settling into idle", async ({ page }) => {
  await seed(page, hatchedSave("", 1));
  await page.goto("/?scene=seed", { waitUntil: "domcontentloaded" });
  const canvas = page.locator(".hatch-baby canvas.nb-frame-canvas");
  await expect(canvas).toHaveAttribute("data-clip", "hatch_complete", { timeout: 30_000 });
  // Ambient acting is allowed to begin immediately after the authored enter;
  // verify that the protected one-shot settles instead of racing one exact
  // idle substate such as blink or look.
  await expect.poll(async () => canvas.getAttribute("data-clip"), { timeout: 7_000 }).not.toBe("hatch_complete");
});
