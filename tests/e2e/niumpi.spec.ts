import { expect, test, type Page } from "@playwright/test";

const SAVE_KEY = "niumpi-save-v5";
const LEGACY_KEYS = ["niumpi-save-v4", "niumpi-memory-v3", "niumpi-memory-v2", "niumpi-memory-v1"];
/** Marks a context as already seeded so reloads read what the game wrote. */
const SEED_SENTINEL = "__e2e_seeded";

/**
 * Seeds the save before any application code runs.
 *
 * Writing it with page.evaluate after a first navigation raced the game's own
 * boot: whichever landed second won, and when the game won it persisted a fresh
 * state over the fixture. The router then sent the test to the Seed Chamber and
 * the failure surfaced as a confusing missing-element error.
 *
 * The guard is what keeps reloads meaningful — init scripts re-run on every
 * navigation, so without it a reload would wipe whatever the game had saved.
 */
async function seedSave(page: Page, save: unknown | null) {
  await page.addInitScript(
    ([key, legacy, sentinel, value]) => {
      if (window.localStorage.getItem(sentinel as string)) return;
      for (const stale of legacy as string[]) window.localStorage.removeItem(stale);
      if (value === null) window.localStorage.removeItem(key as string);
      else window.localStorage.setItem(key as string, JSON.stringify(value));
      window.localStorage.setItem(sentinel as string, "1");
    },
    [SAVE_KEY, LEGACY_KEYS, SEED_SENTINEL, save],
  );
}

/** Starts the game with no save at all, which lands on the Seed Chamber. */
async function openFreshGame(page: Page) {
  await seedSave(page, null);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "The First Care" })).toBeVisible({ timeout: 30_000 });
}

/**
 * Starts the game from an already-hatched companion. Only the fields the test
 * cares about are written — the save loader reconciles everything else, which
 * is exactly the partial-save path a migrated player takes. The seed is written
 * once, so a later reload exercises real persistence.
 */
async function openHatchedGame(page: Page, extra: Record<string, unknown> = {}) {
  const now = 1787000000000;
  await seedSave(page, {
    version: 5,
    profile: { id: "e2e-save", createdAt: now, lastSeenAt: now },
    niumpi: {
      name: "Mango", createdAt: now, hatchedAt: now, seedProgress: 1, stage: 2,
      stageStartedAt: now, careMoments: 60, bond: 45, lastInteractionAt: now,
    },
    // A partial save leaves the pantry empty by design, so the fixture states
    // the stock it wants to feed from.
    inventory: {
      ingredients: { moonberry: 6, cloudpuff: 5, dewdrop: 8, sunseed: 3 },
      items: ["moon-lamp", "cloud-sofa", "garden-pot", "cozy-cushion", "ball-of-yarn"],
      currencies: { dewdrops: 120, starFragments: 4 },
    },
    unlocks: ["seeds", "room", "games", "garden", "cooking", "dreams", "friends", "shop"],
    ...extra,
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Pet Mango" })).toBeVisible({ timeout: 30_000 });
  await waitForReconciledSave(page);
}

/**
 * The partial seed above is only complete once the game has written it back.
 * `stats` is deliberately absent from the fixture, so its arrival proves the
 * reconciled save — not the raw seed — is what is now in storage.
 */
async function waitForReconciledSave(page: Page) {
  await expect
    .poll(async () => typeof (await readSave(page))?.stats?.fullness)
    .toBe("number");
}

/** The rail and the Home activity tiles share labels, so nav clicks are scoped. */
function railTab(page: Page, name: string) {
  return page.locator(".rail-tab", { hasText: new RegExp(`^${name}$`) });
}

function readSave(page: Page) {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, SAVE_KEY);
}

test("loads the game without browser errors", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await openFreshGame(page);

  await expect(page).toHaveTitle(/Niumpi/i);
  await expect(page.getByRole("heading", { name: "The First Care" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Stroke the shell/ }).first()).toBeVisible();

  expect(browserErrors).toEqual([]);
});

test("a care action on the seed is recorded and survives a reload", async ({ page }) => {
  await openFreshGame(page);

  await page.getByRole("button", { name: /^Stroke the shell/ }).last().click();

  // The action must reach the saved state, not just the screen.
  await expect.poll(async () => (await readSave(page))?.niumpi?.seedProgress ?? 0).toBeGreaterThan(0);
  const saved = await readSave(page);
  expect(saved.niumpi.careMoments).toBeGreaterThan(0);
  expect(saved.evolution.vectors.loving).toBeGreaterThan(0);

  await page.reload({ waitUntil: "domcontentloaded" });
  const reloaded = await readSave(page);
  expect(reloaded.niumpi.seedProgress).toBe(saved.niumpi.seedProgress);
});

test("petting a hatched companion raises care and bond, and persists", async ({ page }) => {
  await openHatchedGame(page);

  const before = await readSave(page);
  await page.getByRole("button", { name: "Pet Mango" }).click();

  await expect
    .poll(async () => (await readSave(page))?.niumpi?.careMoments ?? 0)
    .toBeGreaterThan(before.niumpi.careMoments);

  const after = await readSave(page);
  expect(after.niumpi.bond).toBeGreaterThan(before.niumpi.bond);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Pet Mango" })).toBeVisible();
  const reloaded = await readSave(page);
  expect(reloaded.niumpi.careMoments).toBeGreaterThanOrEqual(after.niumpi.careMoments);
});

test("feeding consumes exactly one treat and fills the companion", async ({ page }) => {
  await openHatchedGame(page);

  const before = await readSave(page);
  const startingMoonberries = before.inventory.ingredients.moonberry;
  expect(startingMoonberries).toBeGreaterThan(0);

  // Tap to arm the treat, then use the explicit Feed control: feeding must
  // never be drag-only.
  await page.locator(".snack-card").filter({ hasText: "Moonberry" }).click();
  await page.getByRole("button", { name: "Feed", exact: true }).click();

  await expect(page.locator(".speech-text")).toContainText(/Moonberry|favourite|Yes\./i);
  await expect
    .poll(async () => (await readSave(page))?.inventory?.ingredients?.moonberry)
    .toBe(startingMoonberries - 1);

  const after = await readSave(page);
  expect(after.stats.fullness).toBeGreaterThan(before.stats.fullness);
});

test("the sidebar moves between real scenes and updates the address", async ({ page }) => {
  await openHatchedGame(page);

  await railTab(page, "Room").click();
  await expect(page.getByRole("heading", { name: "Your Room" })).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\?scene=room/);

  await railTab(page, "Games").click();
  await expect(page.getByRole("heading", { name: "Mini Games" })).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\?scene=games/);

  // The shell is persistent, so going back returns to the previous scene
  // without a full reload.
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Your Room" })).toBeVisible({ timeout: 30_000 });
});

test("the game stays usable on a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHatchedGame(page);

  // The rail is replaced by the bottom navigation at this width.
  await expect(page.locator(".bottom-nav")).toBeVisible();
  await expect(page.locator(".rail")).toBeHidden();
  await expect(page.getByRole("button", { name: "Pet Mango" })).toBeVisible();

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(2);
});

test("a Phaser minigame runs its own frame loop and answers user input", async ({ page }) => {
  await openHatchedGame(page);

  await railTab(page, "Games").click();
  await page.locator(".tile-cloud-stack").click();
  await expect(page.getByText("Build the highest tower")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Play", exact: true }).click();

  // Phaser is code-split, so the canvas only exists once the engine arrives.
  const canvas = page.locator(".phaser-host canvas");
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);

  // The engine must actually be drawing: two samples of the same canvas taken
  // a moment apart have to differ, which only happens if the loop is running.
  const first = await canvas.screenshot();
  await page.waitForTimeout(700);
  const second = await canvas.screenshot();
  expect(Buffer.compare(first, second)).not.toBe(0);

  // Real keyboard input must reach the scene and produce a scored block or a
  // finished round — either is a genuine result, a frozen canvas is not.
  // A pointer press is itself a drop, so the canvas is deliberately not
  // clicked here. The slider starts at the far left and sweeps right, so a
  // short wait puts it over the tower and exercises the scoring path rather
  // than only the topple.
  await page.waitForTimeout(2_000);
  const scoreText = page.locator(".score-now");
  const doneScreen = page.locator(".minigame-done");

  await expect
    .poll(
      async () => {
        if (await doneScreen.isVisible()) return "ended";
        if (Number(await scoreText.innerText()) > 0) return "scored";
        await page.keyboard.press("Space");
        await page.waitForTimeout(180);
        return "waiting";
      },
      { timeout: 25_000 },
    )
    .toMatch(/scored|ended/);

  if (await doneScreen.isVisible()) {
    await expect(doneScreen).toContainText(/Target beaten!|Nice round/);
  } else {
    expect(Number(await scoreText.innerText())).toBeGreaterThan(0);
  }
});

/** Care moments that sit inside each stage rather than past its threshold. */
const CARE_IN_STAGE: Record<number, number> = { 1: 10, 2: 70, 3: 160, 4: 320, 5: 600 };

/** A complete niumpi block at a chosen stage, since the fixture spreads at the top level. */
function hatchedAs(stage: number) {
  const now = Date.now();
  return {
    name: "Mango",
    createdAt: now,
    hatchedAt: now,
    seedProgress: 1,
    stage,
    stageStartedAt: now,
    careMoments: CARE_IN_STAGE[stage] ?? 10,
    bond: 45,
    lastInteractionAt: now,
  };
}

test("a freshly hatched Niumpi renders small, and grows", async ({ browser }) => {
  // The whole point of the rebuild. The old rig drew one bitmap of a grown
  // creature at one fixed size, so a hatchling and a mature Niumpi were pixel
  // for pixel identical — this test could not have passed before.
  //
  // Each stage gets its own context. Init scripts accumulate on a page, so a
  // second seedSave on the same page never wins: the first registration re-runs
  // on the next navigation and re-sets the sentinel before the second can.
  const measure = async (stage: number) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    try {
      const page = await context.newPage();
      await openHatchedGame(page, { niumpi: hatchedAs(stage) });
      const body = page.locator(".nb").first();
      await expect(body).toBeVisible();
      const box = await body.boundingBox();
      if (!box) throw new Error(`no box for stage ${stage}`);
      return box;
    } finally {
      await context.close();
    }
  };

  const hatchling = await measure(1);
  const grown = await measure(5);

  expect(hatchling.width).toBeGreaterThan(0);
  expect(hatchling.width).toBeLessThan(grown.width * 0.72);
});

test("the hatchling wears a single leaf and no arms", async ({ page }) => {
  await openHatchedGame(page, { niumpi: hatchedAs(1) });
  await expect(page.locator(".rig-root")).toHaveClass(/growth-stage-1/);
  await expect(page.locator(".nb-leaf")).toHaveCount(1);
  // Arms grow in later; drawing them on a newborn was part of what made the
  // first stage read as an adult.
  await expect(page.locator(".nb-arm")).toHaveCount(0);
  await expect(page.locator(".rig-root")).toHaveClass(/arms-none/);
});

test("the five-leaf crown stays attached to a mature Niumpi", async ({ page }) => {
  await openHatchedGame(page, { niumpi: hatchedAs(4) });

  const rig = page.locator(".rig-root").first();
  const leaves = page.locator(".nb-leaf");
  await expect(rig).toHaveClass(/growth-stage-4/);
  await expect(leaves).toHaveCount(5);

  const rigBox = await rig.boundingBox();
  const leafBoxes = await leaves.evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
  }));
  if (!rigBox) throw new Error("mature rig has no box");

  const crownLeft = Math.min(...leafBoxes.map((box) => box.left));
  const crownRight = Math.max(...leafBoxes.map((box) => box.right));
  const crownTop = Math.min(...leafBoxes.map((box) => box.top));
  const crownBottom = Math.max(...leafBoxes.map((box) => box.bottom));

  // A crown belongs in the upper half of the rig, spans a visible fan, and
  // remains fully inside its creature. This catches the SVG transform bug that
  // threw individual leaves into unrelated parts of the room.
  expect(crownLeft).toBeGreaterThanOrEqual(rigBox.x - 1);
  expect(crownRight).toBeLessThanOrEqual(rigBox.x + rigBox.width + 1);
  expect(crownTop).toBeGreaterThanOrEqual(rigBox.y - 1);
  expect(crownBottom).toBeLessThan(rigBox.y + rigBox.height * 0.42);
  expect(crownRight - crownLeft).toBeGreaterThan(rigBox.width * 0.18);
});
