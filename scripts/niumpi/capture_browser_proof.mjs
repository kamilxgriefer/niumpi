#!/usr/bin/env node
/** Capture proof from the real game route, never from a disconnected mock. */

import { mkdir, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = process.env.NIUMPI_PROOF_URL ?? "http://localhost:3100";
const proofDir = resolve(process.env.NIUMPI_PROOF_DIR ?? "artifacts/niumpi-animation-proof");
const saveKey = "niumpi-save-v6";
const now = 1_787_000_000_000;
const save = {
  version: 5,
  profile: { id: "animation-proof", createdAt: now, lastSeenAt: now, settings: { reducedMotion: "off" } },
  niumpi: {
    name: "Mango", createdAt: now, hatchedAt: now, seedProgress: 1, stage: 2,
    stageStartedAt: now, careMoments: 80, bond: 55, lastInteractionAt: now,
  },
  inventory: {
    ingredients: { moonberry: 6, cloudpuff: 5, dewdrop: 8, sunseed: 3 },
    items: ["moon-lamp", "cloud-sofa", "garden-pot", "cozy-cushion", "ball-of-yarn"],
    currencies: { dewdrops: 120, starFragments: 4 },
  },
  unlocks: ["seeds", "room", "games", "garden", "cooking", "dreams", "friends", "shop"],
};

async function seedPage(page) {
  await page.addInitScript(([key, value]) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify(value));
  }, [saveKey, save]);
}

function collectErrors(page) {
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => errors.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "failed"}`));
  return errors;
}

async function waitForClip(canvas, clip, timeout = 10_000) {
  await canvas.waitFor({ state: "visible", timeout });
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await canvas.getAttribute("data-clip") === clip) return;
    await new Promise((complete) => setTimeout(complete, 40));
  }
  throw new Error(`Timed out waiting for ${clip}`);
}

async function finishVideo(context, page, destination) {
  const video = page.video();
  await context.close();
  if (!video) throw new Error("Playwright video is unavailable");
  const source = await video.path();
  await rename(source, destination);
}

async function captureDesktop(browser, report) {
  const videos = join(proofDir, ".video-desktop");
  await mkdir(videos, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: videos, size: { width: 1280, height: 800 } } });
  const page = await context.newPage();
  await seedPage(page);
  const errors = collectErrors(page);
  await page.goto(`${baseUrl}/?proof=desktop-${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const canvas = page.locator(".rig-root canvas.nb-frame-canvas").first();
  await canvas.waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(".rig-root canvas:is([data-renderer='sprite-atlas-v2'], [data-renderer='sprite-atlas-v3'])").waitFor({ timeout: 30_000 });
  await page.screenshot({ path: join(proofDir, "desktop-game.png"), fullPage: true });
  await canvas.screenshot({ path: join(proofDir, "browser-idle-start.png") });
  const idleStart = Number(await canvas.getAttribute("data-frame"));
  await page.waitForTimeout(700);
  const idleLater = Number(await canvas.getAttribute("data-frame"));
  const rig = page.locator(".rig-root").first();
  await rig.evaluate((element) => element.classList.add("is-blinking"));
  await waitForClip(canvas, "blink", 8_000);
  while (Number(await canvas.getAttribute("data-frame")) < 3) await page.waitForTimeout(20);
  const closedFrame = Number(await canvas.getAttribute("data-frame"));
  await canvas.screenshot({ path: join(proofDir, "browser-blink.png") });
  await rig.evaluate((element) => element.classList.remove("is-blinking"));
  await waitForClip(canvas, "idle", 5_000);
  await page.getByRole("button", { name: "Pet Mango" }).click();
  await waitForClip(canvas, "tap_reaction", 5_000);
  while (Number(await canvas.getAttribute("data-frame")) < 18) await page.waitForTimeout(30);
  await canvas.screenshot({ path: join(proofDir, "browser-tap-peak.png") });
  await waitForClip(canvas, "idle", 6_000);
  report.desktop = {
    viewport: "1440x900",
    idleAdvanced: idleLater !== idleStart,
    blinkObservedFrame: closedFrame,
    tapReturnedToIdle: true,
    renderer: await canvas.getAttribute("data-renderer"),
    consoleErrors: errors,
    horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  };
  await finishVideo(context, page, join(proofDir, "browser-idle-blink-tap.webm"));
}

async function captureMobileFeeding(browser, report) {
  const videos = join(proofDir, ".video-feeding");
  await mkdir(videos, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: videos, size: { width: 390, height: 844 } } });
  const page = await context.newPage();
  await seedPage(page);
  const errors = collectErrors(page);
  await page.goto(`${baseUrl}/?proof=mobile-feed-${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.getByRole("button", { name: "Pet Mango" }).waitFor({ timeout: 30_000 });
  const canvas = page.locator(".rig-root canvas.nb-frame-canvas").first();
  await page.locator(".rig-root canvas:is([data-renderer='sprite-atlas-v2'], [data-renderer='sprite-atlas-v3'])").waitFor({ timeout: 30_000 });
  await page.screenshot({ path: join(proofDir, "mobile-game.png"), fullPage: true });
  const before = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).inventory.ingredients.moonberry, saveKey);
  await page.locator(".snack-card").filter({ hasText: "Moonberry" }).click();
  await page.getByRole("button", { name: "Feed", exact: true }).click();
  await waitForClip(canvas, "eat", 5_000);
  const observedBites = [];
  for (const bite of [1, 2, 3]) {
    const start = Date.now();
    while (Date.now() - start < 5_000 && Number(await canvas.getAttribute("data-food-bites")) !== bite) await page.waitForTimeout(25);
    if (Number(await canvas.getAttribute("data-food-bites")) !== bite) throw new Error(`Missing bite ${bite}`);
    observedBites.push(bite);
    await canvas.screenshot({ path: join(proofDir, `browser-feeding-bite-${bite}.png`) });
  }
  const swallowedAt = Date.now();
  while (Date.now() - swallowedAt < 5_000 && await canvas.getAttribute("data-food-prop") !== "none") await page.waitForTimeout(25);
  await waitForClip(canvas, "idle", 7_000);
  const after = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).inventory.ingredients.moonberry, saveKey);
  report.mobileFeeding = {
    viewport: "390x844",
    food: "moonberry",
    observedBites,
    swallowed: await canvas.getAttribute("data-food-prop") === "none",
    inventoryBefore: before,
    inventoryAfter: after,
    consumedExactlyOne: after === before - 1,
    returnedToIdle: true,
    consoleErrors: errors,
    horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  };
  await finishVideo(context, page, join(proofDir, "browser-feeding.webm"));
}

await mkdir(proofDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { baseUrl, capturedAt: new Date().toISOString() };
try {
  await captureDesktop(browser, report);
  await captureMobileFeeding(browser, report);
} finally {
  await browser.close();
}
report.result = report.desktop?.idleAdvanced
  && report.desktop?.tapReturnedToIdle
  && report.desktop?.consoleErrors.length === 0
  && report.desktop?.horizontalOverflow <= 2
  && report.mobileFeeding?.consumedExactlyOne
  && report.mobileFeeding?.observedBites.join(",") === "1,2,3"
  && report.mobileFeeding?.consoleErrors.length === 0
  && report.mobileFeeding?.horizontalOverflow <= 2 ? "PASS" : "FAIL";
await writeFile(join(proofDir, "browser-proof.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.result !== "PASS") process.exitCode = 1;
