import { expect, test, type Page } from "@playwright/test";

const SAVE_KEY = "niumpi-save-v5";
const LEGACY_KEYS = ["niumpi-save-v4", "niumpi-memory-v3", "niumpi-memory-v2", "niumpi-memory-v1"];

type Viewport = { name: string; width: number; height: number };

const DESKTOP: Viewport = { name: "desktop", width: 1440, height: 900 };
const LAPTOP: Viewport = { name: "laptop", width: 1366, height: 768 };
const TABLET: Viewport = { name: "tablet", width: 1024, height: 768 };
const PHONE: Viewport = { name: "phone", width: 390, height: 844 };

/**
 * A save complete enough that every unlocked scene renders real content, so a
 * layout check is never measuring an empty state by accident.
 */
function fixture() {
  const now = 1787000000000;
  return {
    version: 4,
    profile: {
      id: "layout-audit", createdAt: now, lastSeenAt: now,
      settings: { sound: false, music: false, effects: true, reducedMotion: "on", lowPower: false, seedQuestions: true, shareProfile: false },
    },
    niumpi: {
      name: "Mango", createdAt: now, hatchedAt: now, seedProgress: 1, stage: 3,
      stageStartedAt: now, careMoments: 180, bond: 62, lastInteractionAt: now,
    },
    stats: { fullness: 71, energy: 80, joy: 75, comfort: 60, curiosity: 50, wellbeing: 70, variety: 40, trust: 30 },
    inventory: {
      ingredients: { moonberry: 6, cloudpuff: 5, dewdrop: 8, sunseed: 3 },
      items: ["moon-lamp", "cloud-sofa", "garden-pot", "cozy-cushion"],
      currencies: { dewdrops: 480, starFragments: 12 },
    },
    unlocks: ["seeds", "room", "games", "garden", "cooking", "dreams", "friends", "shop", "evolution"],
  };
}

async function openScene(page: Page, scene: string, viewport: Viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([key, legacy, save]) => {
      for (const stale of legacy as string[]) window.localStorage.removeItem(stale);
      window.localStorage.setItem(key as string, JSON.stringify(save));
    },
    [SAVE_KEY, LEGACY_KEYS, fixture()],
  );
  await page.goto(`/?scene=${scene}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".scene-host")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".scene-skeleton")).toHaveCount(0, { timeout: 30_000 });
}

/** Every structural guarantee the shell must hold, at any size. */
async function auditLayout(page: Page, label: string) {
  const result = await page.evaluate(() => {
    const de = document.documentElement;
    const viewport = de.clientWidth;
    const box = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };

    const rail = document.querySelector(".rail");
    const railVisible = rail ? getComputedStyle(rail).display !== "none" : false;
    const railBox = railVisible ? rail!.getBoundingClientRect() : null;
    const sceneBox = box(".scene-host");

    // Anything interactive that sticks out sideways, ignoring deliberate
    // horizontal scrollers such as the snack rail.
    const inScroller = (el: Element) => {
      let node: Element | null = el.parentElement;
      while (node && node !== document.body) {
        const overflow = getComputedStyle(node).overflowX;
        if (overflow === "auto" || overflow === "scroll") return true;
        node = node.parentElement;
      }
      return false;
    };
    const escaping: string[] = [];
    for (const el of document.querySelectorAll("button, a, input")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (inScroller(el)) continue;
      if (r.left < -1 || r.right > viewport + 1) escaping.push(el.className.toString().split(" ")[0] || el.tagName);
    }

    return {
      scrollWidth: de.scrollWidth,
      viewport,
      scene: sceneBox,
      railRight: railBox ? railBox.right : null,
      escaping: [...new Set(escaping)].slice(0, 5),
    };
  });

  // 1. Nothing may push the document sideways.
  expect(result.scrollWidth, `${label}: horizontal overflow`).toBeLessThanOrEqual(result.viewport + 1);

  // 2. The scene must be real and inside the viewport.
  expect(result.scene, `${label}: scene missing`).not.toBeNull();
  expect(result.scene!.w, `${label}: scene has no width`).toBeGreaterThan(0);
  expect(result.scene!.h, `${label}: scene has no height`).toBeGreaterThan(0);
  expect(result.scene!.left, `${label}: scene starts left of the viewport`).toBeGreaterThanOrEqual(-1);
  expect(result.scene!.right, `${label}: scene runs past the viewport`).toBeLessThanOrEqual(result.viewport + 1);

  // 3. The rail owns its own column and never sits on the scene.
  if (result.railRight !== null) {
    expect(result.scene!.left, `${label}: rail overlaps the scene`).toBeGreaterThanOrEqual(result.railRight - 1);
  }

  // 4. No control may hang outside the viewport horizontally.
  expect(result.escaping, `${label}: controls outside the viewport`).toEqual([]);
}

/** The fixed bar must not bury the last thing a player can press. */
async function auditBottomNav(page: Page, label: string) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  const result = await page.evaluate(() => {
    const nav = document.querySelector(".bottom-nav");
    if (!nav || getComputedStyle(nav).display === "none") return null;
    const navTop = nav.getBoundingClientRect().top;
    const actions = [...document.querySelectorAll("button, a")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !el.closest(".bottom-nav") && !el.closest(".shell-overlay");
    });
    const last = actions[actions.length - 1];
    return {
      navTop,
      navHeight: nav.getBoundingClientRect().height,
      lastBottom: last ? last.getBoundingClientRect().bottom : null,
      lastName: last ? last.className.toString().split(" ")[0] : null,
    };
  });
  if (!result) return;
  expect(result.navHeight, `${label}: bottom nav collapsed`).toBeGreaterThan(40);
  if (result.lastBottom !== null) {
    expect(result.lastBottom, `${label}: bottom nav covers "${result.lastName}"`).toBeLessThanOrEqual(result.navTop + 1);
  }
}

function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

const HOME_VIEWPORTS = [DESKTOP, LAPTOP, TABLET, PHONE];

for (const viewport of HOME_VIEWPORTS) {
  test(`Home holds its layout at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const errors = watchConsole(page);
    await openScene(page, "home", viewport);

    await auditLayout(page, `Home ${viewport.name}`);

    // The companion is the focus of this screen and must be fully on screen.
    const rig = page.locator(".rig-root").first();
    await expect(rig).toBeVisible();
    const rigBox = await rig.boundingBox();
    expect(rigBox!.width).toBeGreaterThan(120);
    expect(rigBox!.x).toBeGreaterThanOrEqual(-1);
    expect(rigBox!.x + rigBox!.width).toBeLessThanOrEqual(viewport.width + 1);

    // The stats panel must not sit on top of the character.
    const stats = await page.locator(".hero-stats").boundingBox();
    if (stats && rigBox) {
      const overlaps = stats.x < rigBox.x + rigBox.width && stats.x + stats.width > rigBox.x
        && stats.y < rigBox.y + rigBox.height && stats.y + stats.height > rigBox.y;
      expect(overlaps, `Home ${viewport.name}: stats overlap the character`).toBe(false);
    }

    // The snack rail may scroll sideways, but every treat keeps a deliberate
    // width rather than collapsing to fit.
    const snackWidths = await page.locator(".snack-card").evaluateAll(
      (nodes) => nodes.map((n) => Math.round(n.getBoundingClientRect().width)),
    );
    expect(snackWidths.length).toBeGreaterThan(0);
    for (const width of snackWidths) {
      expect(width, `Home ${viewport.name}: snack card too narrow`).toBeGreaterThanOrEqual(96);
    }

    await auditBottomNav(page, `Home ${viewport.name}`);
    expect(errors).toEqual([]);
  });
}

for (const viewport of [LAPTOP, PHONE]) {
  test(`Room holds its layout at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const errors = watchConsole(page);
    await openScene(page, "room", viewport);

    await auditLayout(page, `Room ${viewport.name}`);

    // The room canvas must be a real, bounded stage.
    const canvas = await page.locator(".room-canvas").boundingBox();
    expect(canvas!.width).toBeGreaterThan(200);
    expect(canvas!.height).toBeGreaterThan(180);
    expect(canvas!.height).toBeLessThanOrEqual(viewport.height);

    // Niumpi must still be standing in the room.
    const rig = await page.locator(".room-companion .rig-root").boundingBox();
    expect(rig!.width).toBeGreaterThan(80);

    await auditBottomNav(page, `Room ${viewport.name}`);
    expect(errors).toEqual([]);
  });
}

test("Settings stays usable on a phone", async ({ page }) => {
  const errors = watchConsole(page);
  await openScene(page, "home", PHONE);

  await page.locator(".settings-button").click();
  const card = page.locator(".modal-card");
  await expect(card).toBeVisible();

  const box = (await card.boundingBox())!;
  expect(box.width).toBeGreaterThan(200);
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width + 1);
  // A sheet taller than the screen would put its controls out of reach.
  expect(box.height).toBeLessThanOrEqual(PHONE.height);

  // The dialog scrolls internally rather than growing past the viewport.
  const scrolls = await card.evaluate((el) => el.scrollHeight > el.clientHeight ? getComputedStyle(el).overflowY : "fits");
  expect(["auto", "scroll", "fits"]).toContain(scrolls);

  await auditLayout(page, "Settings phone");
  expect(errors).toEqual([]);
});

test("the settings control never sits on top of a scene heading", async ({ page }) => {
  await openScene(page, "room", DESKTOP);
  const gear = (await page.locator(".settings-button").boundingBox())!;
  const heading = (await page.locator(".scene-head h1").boundingBox())!;
  const overlaps = gear.x < heading.x + heading.width && gear.x + gear.width > heading.x
    && gear.y < heading.y + heading.height && gear.y + gear.height > heading.y;
  expect(overlaps, "settings button overlaps the scene heading").toBe(false);
});
