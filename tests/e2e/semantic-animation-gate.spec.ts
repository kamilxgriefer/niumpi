import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  NIUMPI_AVAILABLE_MODEL_VARIANTS,
  type NiumpiModelVariant,
} from "../../app/anim/NiumpiModelVariants.ts";
import {
  reducedEventsForClip,
  spritePhaseAtFrame,
  validateSpriteManifest,
  type NiumpiSemanticSpriteClip,
  type NiumpiSpriteManifest,
  type SpriteClip,
  type SpritePhase,
  type SpritePresentationEventDetail,
  type SpriteEvent,
} from "../../app/anim/NiumpiSpriteRuntime.ts";
import { createGameState, reconcile, STORAGE_KEY } from "../../app/game/state.ts";
import type { GameState, RouteId, RoomId, StageId } from "../../app/game/types.ts";

/**
 * TODO(semantic-atlas-landing): remove NIUMPI_REQUIRE_SEMANTIC and make this
 * release gate unconditional in CI in the same commit that lands all ninety
 * semantic clips. Until then, turning the flag on must fail for every missing
 * clip/atlas; an idle fallback is never accepted as proof.
 */
const REQUIRE_SEMANTIC = process.env.NIUMPI_REQUIRE_SEMANTIC === "1";
const DECLARED_VARIANTS = [...NIUMPI_AVAILABLE_MODEL_VARIANTS];

type FrameTrace = {
  reason: "canvas" | "root";
  at: number;
  clip: string;
  frame: number;
  spriteToken: string;
  spritePhase: string;
  rootAnim: string;
  rootPhase: string;
  rootToken: string;
  rootEnteredAt: string;
  rootPhaseStartedAt: string;
  rootPhaseEndsAt: string;
  sourceToken: string;
  sourceAnim: string;
  sourcePhase: string;
  sourceEnteredAt: string;
  sourcePhaseStartedAt: string;
  sourcePhaseEndsAt: string;
  atlasRect: string;
  rigX: number;
};

type ObservedPresentationEvent = SpritePresentationEventDetail & {
  rigX: number;
  rootToken: string;
  rootPhase: string;
  sourcePhase: string;
  canvasSpriteToken: number;
};

declare global {
  interface Window {
    __niumpiFrameTrace?: FrameTrace[];
    __niumpiPresentationEvents?: ObservedPresentationEvent[];
    __niumpiTraceCleanup?: () => void;
  }
}

const EXPECTED_EVENTS: Readonly<Record<NiumpiSemanticSpriteClip, readonly SpriteEvent[]>> = {
  sad: [{ frame: 0, type: "clip_start" }, { frame: 6, type: "sad_drop" }, { frame: 18, type: "sad_sigh" }, { frame: 36, type: "recovery_start" }, { frame: 47, type: "clip_complete" }],
  travel: [{ frame: 0, type: "clip_start" }, { frame: 8, type: "travel_depart" }, { frame: 20, type: "travel_pulse", payload: { index: 1 } }, { frame: 32, type: "travel_pulse", payload: { index: 2 } }, { frame: 44, type: "travel_apex" }, { frame: 56, type: "travel_land" }, { frame: 71, type: "travel_arrive" }, { frame: 71, type: "clip_complete" }],
  sleep: [{ frame: 0, type: "clip_start" }, { frame: 12, type: "sleep_eyes_closed" }, { frame: 16, type: "sleep_loop_enter" }, { frame: 36, type: "sleep_breath", payload: { phase: "hold" } }, { frame: 68, type: "sleep_breath", payload: { phase: "exhale" } }, { frame: 80, type: "sleep_murmur" }, { frame: 95, type: "sleep_loop_end" }, { frame: 96, type: "sleep_exit" }, { frame: 111, type: "clip_complete" }],
  read: [{ frame: 0, type: "clip_start" }, { frame: 10, type: "prop_attach", payload: { prop: "book" } }, { frame: 12, type: "book_open" }, { frame: 24, type: "reading_pass" }, { frame: 34, type: "reading_pass" }, { frame: 40, type: "page_turn" }, { frame: 52, type: "reading_pass" }, { frame: 56, type: "book_discovery" }, { frame: 68, type: "book_close" }, { frame: 76, type: "prop_detach" }, { frame: 83, type: "clip_complete" }],
  lamp: [{ frame: 0, type: "clip_start" }, { frame: 8, type: "lamp_reach" }, { frame: 18, type: "lamp_contact" }, { frame: 20, type: "lamp_glow", payload: { presentationOnly: true } }, { frame: 32, type: "lamp_release" }, { frame: 47, type: "clip_complete" }],
  dance: [{ frame: 0, type: "clip_start" }, { frame: 8, type: "dance_beat", payload: { index: 1 } }, { frame: 24, type: "dance_beat", payload: { index: 2 } }, { frame: 28, type: "dance_airborne" }, { frame: 40, type: "dance_beat", payload: { index: 3 } }, { frame: 44, type: "dance_contact" }, { frame: 56, type: "dance_beat", payload: { index: 4 } }, { frame: 60, type: "recovery_start" }, { frame: 71, type: "clip_complete" }],
  sing: [{ frame: 0, type: "clip_start" }, { frame: 6, type: "sing_inhale" }, { frame: 12, type: "vocal_phrase", payload: { index: 1 } }, { frame: 16, type: "mouth_cue", payload: { shape: "n" } }, { frame: 24, type: "mouth_cue", payload: { shape: "ee" } }, { frame: 32, type: "vocal_phrase", payload: { index: 2 } }, { frame: 36, type: "mouth_cue", payload: { shape: "oo" } }, { frame: 44, type: "mouth_cue", payload: { shape: "m" } }, { frame: 52, type: "vocal_phrase", payload: { index: 3 } }, { frame: 56, type: "mouth_cue", payload: { shape: "ah" } }, { frame: 56, type: "sing_held_note" }, { frame: 68, type: "mouth_cue", payload: { shape: "hold" } }, { frame: 80, type: "sing_release" }, { frame: 95, type: "clip_complete" }],
  roll: [{ frame: 0, type: "clip_start" }, { frame: 8, type: "roll_launch" }, { frame: 14, type: "roll_contact" }, { frame: 26, type: "roll_half" }, { frame: 32, type: "roll_contact" }, { frame: 44, type: "roll_land" }, { frame: 48, type: "roll_dizzy" }, { frame: 59, type: "clip_complete" }],
  cozy: [{ frame: 0, type: "clip_start" }, { frame: 10, type: "prop_attach", payload: { prop: "cozy-target" } }, { frame: 12, type: "cozy_contact" }, { frame: 24, type: "cozy_curl" }, { frame: 36, type: "cozy_sigh" }, { frame: 52, type: "cozy_hold_end" }, { frame: 56, type: "cozy_release" }, { frame: 64, type: "prop_detach" }, { frame: 71, type: "clip_complete" }],
};

const manifestCache = new Map<NiumpiModelVariant, NiumpiSpriteManifest>();

function manifestFor(variant: NiumpiModelVariant): NiumpiSpriteManifest {
  const cached = manifestCache.get(variant);
  if (cached) return cached;
  const path = join(process.cwd(), "public/assets/niumpi/v2", variant, "manifest.json");
  const manifest = validateSpriteManifest(JSON.parse(readFileSync(path, "utf8")));
  expect(manifest.variant).toBe(variant);
  manifestCache.set(variant, manifest);
  return manifest;
}

function semanticClip(variant: NiumpiModelVariant, name: NiumpiSemanticSpriteClip): SpriteClip {
  const clip = manifestFor(variant).clips[name];
  if (!clip) throw new Error(`${variant} declares no authored semantic clip ${name}`);
  expect(clip.events).toEqual(EXPECTED_EVENTS[name]);
  return clip;
}

function progressFor(variant: NiumpiModelVariant): { stage: StageId; morphology: "seedling" | RouteId; route: RouteId | null } {
  if (variant === "baby") return { stage: 1, morphology: "seedling", route: null };
  if (variant === "stage-2") return { stage: 2, morphology: "seedling", route: null };
  if (variant === "stage-3") return { stage: 3, morphology: "seedling", route: null };
  if (variant === "stage-4") return { stage: 4, morphology: "seedling", route: null };
  if (variant === "stage-5") return { stage: 5, morphology: "seedling", route: null };
  return { stage: 5, morphology: variant, route: variant };
}

function fixtureForVariant(
  variant: NiumpiModelVariant,
  options: { tired?: boolean; room?: RoomId; reduced?: boolean } = {},
): GameState {
  const now = 1_800_000_000_000;
  const progress = progressFor(variant);
  const state = createGameState(now, `semantic-${variant}`);
  state.profile.settings = {
    ...state.profile.settings,
    sound: false,
    music: false,
    effects: false,
    reducedMotion: options.reduced ? "on" : "off",
  };
  state.niumpi = {
    ...state.niumpi,
    name: "Mango",
    hatchedAt: now,
    seedProgress: 1,
    stage: progress.stage,
    stageStartedAt: now,
    careMoments: 0,
    bond: 65,
    lastInteractionAt: now,
    cleanliness: 91,
  };
  state.stats = {
    ...state.stats,
    energy: options.tired ? 5 : 88,
    fullness: 72,
    joy: 78,
    comfort: 70,
    curiosity: 65,
    wellbeing: 75,
    variety: 50,
    trust: 60,
  };
  state.evolution.lockedRoute = progress.route;
  state.evolution.routeConfidence = progress.route ? 100 : 0;
  state.phenotype = {
    ...state.phenotype,
    morphology: progress.morphology,
    bodyPalette: progress.route ?? "cloud",
    bellyPalette: progress.route ? `${progress.route}-belly` : "pearl",
    leafType: progress.route === "mistwander" ? "long" : "classic",
  };
  state.inventory.items = [...new Set([...state.inventory.items, "moon-bed", "ball-of-yarn"] )];
  for (const room of Object.values(state.room.rooms)) room.unlockedAt = now;
  state.room.rooms.bedroom.placed = [{ uid: "semantic-moon-bed", itemId: "moon-bed", x: 3, y: 0, flipped: false, layer: 0 }];
  state.room.rooms["play-nook"].placed = [{ uid: "semantic-yarn", itemId: "ball-of-yarn", x: 3, y: 0, flipped: false, layer: 0 }];
  const activeRoomId = options.room ?? "living-room";
  state.room.activeRoomId = activeRoomId;
  state.room.theme = state.room.rooms[activeRoomId].theme;
  state.room.placed = state.room.rooms[activeRoomId].placed.map((item) => ({ ...item }));
  state.unlocks = ["seeds", "room", "games", "garden", "shop"];
  return reconcile(state, now);
}

async function seed(page: Page, state: GameState) {
  await page.addInitScript(([key, value, marker]) => {
    window.__NIUMPI_RUNTIME_TEST__ = {
      now: (value as GameState).profile.createdAt,
      heartbeat: false,
    };
    if (window.sessionStorage.getItem(marker as string)) return;
    window.localStorage.clear();
    window.localStorage.setItem(key as string, JSON.stringify(value));
    window.sessionStorage.setItem(marker as string, "1");
  }, [STORAGE_KEY, state, `semantic-fixture:${state.profile.id}`]);
}

function captureRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

function playerFor(page: Page, variant: NiumpiModelVariant) {
  const root = page.locator(".rig-root").first();
  const player = root.locator(`.nb-frame-player[data-variant="${variant}"]`);
  return { root, player, canvas: player.locator("canvas.nb-frame-canvas") };
}

async function expectReady(page: Page, variant: NiumpiModelVariant) {
  const parts = playerFor(page, variant);
  await expect(parts.player).not.toHaveClass(/is-loading|is-error/, { timeout: 30_000 });
  await expect(parts.canvas).toBeVisible();
  await expect(parts.canvas).toHaveAttribute("data-renderer", /sprite-atlas-v[23]/);
  await expect(parts.canvas).toHaveAttribute("data-schema-version", /^[23]$/);
  expect(await parts.canvas.getAttribute("data-renderer"))
    .toBe(`sprite-atlas-v${await parts.canvas.getAttribute("data-schema-version")}`);
  await expect(parts.canvas).toHaveAttribute("data-variant", variant);
  await expect(parts.player.locator(".nb-frame-fallback")).toBeHidden();
  await expect(parts.canvas).not.toHaveAttribute("data-error", /.+/);
  return parts;
}

async function openGame(
  page: Page,
  variant: NiumpiModelVariant,
  scene: "home" | "niumpi" | "room",
  options: { tired?: boolean; room?: RoomId; reduced?: boolean; mobile?: boolean } = {},
) {
  await page.setViewportSize(options.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await seed(page, fixtureForVariant(variant, options));
  await page.goto(scene === "home" ? "/" : `/?scene=${scene}`, { waitUntil: "domcontentloaded" });
  const player = await expectReady(page, variant);
  await page.waitForTimeout(850);
  return player;
}

async function installProductionTrace(_root: Locator, canvas: Locator) {
  await canvas.evaluate((element) => {
    window.__niumpiTraceCleanup?.();
    const sprite = element as HTMLCanvasElement;
    const rig = sprite.closest<HTMLElement>(".rig-root");
    if (!rig) throw new Error("Production semantic trace cannot find its rig root");
    const frames: FrameTrace[] = [];
    const events: ObservedPresentationEvent[] = [];
    const record = (reason: "canvas" | "root") => {
      const entry: FrameTrace = {
        reason,
        at: performance.now(),
        clip: sprite.dataset.clip ?? "",
        frame: Number(sprite.dataset.frame ?? -1),
        spriteToken: sprite.dataset.spriteToken ?? "",
        spritePhase: sprite.dataset.phase ?? "",
        rootAnim: rig.dataset.anim ?? "",
        rootPhase: rig.dataset.phase ?? "",
        rootToken: rig.dataset.motionToken ?? "",
        rootEnteredAt: rig.dataset.motionEnteredAt ?? "",
        rootPhaseStartedAt: rig.dataset.phaseStartedAt ?? "",
        rootPhaseEndsAt: rig.dataset.phaseEndsAt ?? "",
        sourceToken: sprite.dataset.sourceMotionToken ?? "",
        sourceAnim: sprite.dataset.sourceAnim ?? "",
        sourcePhase: sprite.dataset.sourcePhase ?? "",
        sourceEnteredAt: sprite.dataset.sourceEnteredAt ?? "",
        sourcePhaseStartedAt: sprite.dataset.sourcePhaseStartedAt ?? "",
        sourcePhaseEndsAt: sprite.dataset.sourcePhaseEndsAt ?? "",
        atlasRect: sprite.dataset.atlasRect ?? "",
        rigX: Number.parseFloat(getComputedStyle(rig).getPropertyValue("--rig-x")) || 0,
      };
      const previous = frames.at(-1);
      const fields = ["reason", "clip", "frame", "spriteToken", "spritePhase", "rootAnim", "rootPhase", "rootToken", "rootEnteredAt", "rootPhaseStartedAt", "rootPhaseEndsAt", "sourceToken", "sourceAnim", "sourcePhase", "sourceEnteredAt", "sourcePhaseStartedAt", "sourcePhaseEndsAt", "atlasRect", "rigX"];
      const key = JSON.stringify(entry, fields);
      const previousKey = previous
        ? JSON.stringify(previous, fields)
        : "";
      if (key !== previousKey) frames.push(entry);
    };
    const onPresentation = (event: Event) => {
      const detail = (event as CustomEvent<SpritePresentationEventDetail>).detail;
      events.push({
        ...detail,
        rigX: Number.parseFloat(getComputedStyle(rig).getPropertyValue("--rig-x")) || 0,
        rootToken: rig.dataset.motionToken ?? "",
        rootPhase: rig.dataset.phase ?? "",
        sourcePhase: sprite.dataset.sourcePhase ?? "",
        canvasSpriteToken: Number(sprite.dataset.spriteToken ?? -1),
      });
      record("canvas");
    };
    sprite.addEventListener("niumpi:presentation-event", onPresentation);
    const canvasObserver = new MutationObserver(() => record("canvas"));
    canvasObserver.observe(sprite, { attributes: true, attributeFilter: ["data-clip", "data-frame", "data-sprite-token", "data-phase", "data-source-motion-token", "data-source-anim", "data-source-phase", "data-source-entered-at", "data-source-phase-started-at", "data-source-phase-ends-at", "data-atlas-rect"] });
    const rootObserver = new MutationObserver(() => record("root"));
    rootObserver.observe(rig, { attributes: true, attributeFilter: ["data-anim", "data-phase", "data-motion-token", "data-motion-entered-at", "data-phase-started-at", "data-phase-ends-at", "style"] });
    record("canvas");
    window.__niumpiFrameTrace = frames;
    window.__niumpiPresentationEvents = events;
    window.__niumpiTraceCleanup = () => {
      canvasObserver.disconnect();
      rootObserver.disconnect();
      sprite.removeEventListener("niumpi:presentation-event", onPresentation);
    };
  });
}

async function runtimeTrace(page: Page) {
  return page.evaluate(() => ({
    frames: window.__niumpiFrameTrace ?? [],
    events: window.__niumpiPresentationEvents ?? [],
  }));
}

function transitions(trace: FrameTrace[]) {
  const values: string[] = [];
  for (const entry of trace.filter((candidate) => candidate.reason === "canvas")) {
    if (entry.clip && values.at(-1) !== entry.clip) values.push(entry.clip);
  }
  return values;
}

function containsInOrder(values: readonly string[], expected: readonly string[]) {
  let cursor = 0;
  for (const value of values) {
    if (value === expected[cursor]) cursor += 1;
    if (cursor === expected.length) return true;
  }
  return false;
}

async function readState(page: Page): Promise<GameState> {
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "null") as GameState, STORAGE_KEY);
}

async function readLiveState(page: Page): Promise<GameState> {
  return page.evaluate(() => {
    const state = window.__NIUMPI_RUNTIME_TEST__?.liveState;
    if (!state) throw new Error("The supported Niumpi runtime clock bridge did not expose live state");
    return structuredClone(state);
  });
}

async function waitForActionCommit(page: Page, before: GameState, mutates: boolean) {
  if (mutates) {
    await expect.poll(async () => readLiveState(page), { timeout: 4_000 }).not.toEqual(before);
  }
  await expect.poll(async () => {
    const [live, persisted] = await Promise.all([readLiveState(page), readState(page)]);
    return persisted && JSON.stringify(persisted) === JSON.stringify(live);
  }, { timeout: 4_000 }).toBe(true);
  const [live, persisted] = await Promise.all([readLiveState(page), readState(page)]);
  expect(persisted).toEqual(live);
  return live;
}

async function expectStateStable(page: Page, committed: GameState) {
  const [live, persisted] = await Promise.all([readLiveState(page), readState(page)]);
  expect(live).toEqual(committed);
  expect(persisted).toEqual(committed);
}

async function expectNoOverflowAndBudget(page: Page, canvas: Locator) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(2);
  const cache = await canvas.evaluate((element) => ({
    local: Number((element as HTMLElement).dataset.decodedBytes),
    localBudget: Number((element as HTMLElement).dataset.decodedBudget),
    global: Number((element as HTMLElement).dataset.globalDecodedBytes),
    globalBudget: Number((element as HTMLElement).dataset.globalDecodedBudget),
  }));
  expect(cache.local).toBeLessThanOrEqual(cache.localBudget);
  expect(cache.global).toBeLessThanOrEqual(cache.globalBudget);
}

function eventProjection(events: readonly SpritePresentationEventDetail[]) {
  return events.map(({ authoredFrame, type, payload, synthetic }) => ({ authoredFrame, type, payload, synthetic }));
}

function assertObservedEventContract(events: readonly ObservedPresentationEvent[], clip: SpriteClip) {
  const authored = events.filter((event) => !event.synthetic);
  expect(authored.map(({ authoredFrame, type, payload }) => ({ frame: authoredFrame, type, payload })))
    .toEqual(EXPECTED_EVENTS[clip.name as NiumpiSemanticSpriteClip].map(({ frame, type, payload }) => ({ frame, type, payload })));
  for (const [index, event] of events.entries()) {
    if (index > 0) expect(event.sequence).toBe(events[index - 1].sequence + 1);
    expect(event.canvasSpriteToken).toBe(event.spriteToken);
    if (!event.synthetic) {
      expect(event.observedFrame).toBeGreaterThanOrEqual(event.authoredFrame);
      expect(event.observedFrame).toBeLessThanOrEqual(event.authoredFrame + 1);
      expect(event.rootPhase).toBe(event.sourcePhase);
    }
  }
}

function expectedPhase(clip: SpriteClip, frame: number): SpritePhase {
  return spritePhaseAtFrame(clip, frame);
}

function expectSameClock(left: string, right: string) {
  if (left === "none" || right === "none") {
    expect(left).toBe(right);
    return;
  }
  expect(Math.abs(Number(left) - Number(right))).toBeLessThanOrEqual(0.002);
}

function assertFrameContract(trace: FrameTrace[], clip: SpriteClip, rootAnim: string) {
  const frames = trace.filter((entry) => entry.reason === "canvas" && entry.clip === clip.name);
  expect(frames.length).toBeGreaterThan(2);
  const sourced = frames.filter((entry) => entry.sourceToken !== "none" && entry.sourceToken);
  expect(sourced.length, `${clip.name} must retain its production controller source`).toBe(frames.length);
  for (const entry of sourced) {
    expect(entry.spritePhase, `${clip.name}@${entry.frame}`).toBe(expectedPhase(clip, entry.frame));
    expect(entry.sourceToken, `${clip.name}@${entry.frame} token`).toBe(entry.rootToken);
    expect(entry.sourceAnim, `${clip.name}@${entry.frame} anim`).toBe(rootAnim);
    expect(entry.sourcePhase, `${clip.name}@${entry.frame} source phase`).toBe(entry.rootPhase);
    expect(entry.spritePhase, `${clip.name}@${entry.frame} root phase`).toBe(entry.rootPhase);
    expectSameClock(entry.sourceEnteredAt, entry.rootEnteredAt);
    expectSameClock(entry.sourcePhaseStartedAt, entry.rootPhaseStartedAt);
    expectSameClock(entry.sourcePhaseEndsAt, entry.rootPhaseEndsAt);
  }
  expect(new Set(frames.map((entry) => entry.atlasRect)).size).toBeGreaterThan(1);

  const finalClipIndex = trace.map((entry) => entry.clip).lastIndexOf(clip.name);
  const idle = trace.slice(finalClipIndex + 1).find((entry) => (
    entry.reason === "canvas" && entry.clip === "idle" && entry.rootAnim === "idle" && entry.sourceToken !== "none"
  ));
  expect(idle, `${clip.name} must hand its controller token/phase back to idle`).toBeTruthy();
  expect(idle?.sourceToken).toBe(idle?.rootToken);
  expect(idle?.sourcePhase).toBe(idle?.rootPhase);
}

async function presentationEventsFromDataset(canvas: Locator): Promise<SpritePresentationEventDetail[]> {
  return canvas.evaluate((element) => JSON.parse((element as HTMLElement).dataset.presentationTrace ?? "[]"));
}

async function assertProductionEventParity(canvas: Locator, observed: SpritePresentationEventDetail[], clipName: NiumpiSemanticSpriteClip) {
  const fromDataset = (await presentationEventsFromDataset(canvas)).filter((event) => event.clip === clipName);
  expect(eventProjection(fromDataset)).toEqual(eventProjection(observed.filter((event) => event.clip === clipName)));
}

async function expectPresentationVisible(
  canvas: Locator,
  kind: "prop" | "effect",
  value: string,
  childClass: string,
) {
  const layer = canvas.locator("xpath=..").locator(".nb-presentation-layer");
  await expect(layer).toHaveAttribute(`data-presentation-${kind}`, value, { timeout: 5_000 });
  const child = layer.locator(childClass);
  await expect.poll(async () => child.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return Number.parseFloat(getComputedStyle(element).opacity) > 0.15 && box.width > 4 && box.height > 4;
  }), { timeout: 2_000 }).toBe(true);
}

async function expectPresentationCleared(canvas: Locator) {
  const layer = canvas.locator("xpath=..").locator(".nb-presentation-layer");
  await expect(layer).toHaveAttribute("data-presentation-prop", "none");
  await expect(layer).toHaveAttribute("data-presentation-effect", "none");
  expect(await layer.locator(".nb-presentation-prop, .nb-presentation-effect").evaluateAll((elements) => (
    elements.every((element) => Number.parseFloat(getComputedStyle(element).opacity) === 0)
  ))).toBe(true);
}

async function expectClipPresentation(canvas: Locator, clip: Exclude<NiumpiSemanticSpriteClip, "sleep" | "travel">) {
  if (clip === "read") return expectPresentationVisible(canvas, "prop", "book", ".nb-presentation-book");
  if (clip === "cozy") return expectPresentationVisible(canvas, "prop", "cozy-target", ".nb-presentation-blanket");
  if (clip === "lamp") return expectPresentationVisible(canvas, "effect", "glow", ".nb-presentation-glow");
  if (clip === "sing" || clip === "dance") return expectPresentationVisible(canvas, "effect", "note", ".nb-presentation-note");
  if (clip === "sad") return expectPresentationVisible(canvas, "effect", "sigh", ".nb-presentation-sigh");
  if (clip === "roll") return expectPresentationVisible(canvas, "effect", "travel", ".nb-presentation-travel");
}

function roomActivityButton(page: Page, label: string) {
  return page.locator(".rw-reaction-list button", { hasText: label }).first();
}

function sceneAndRoomFor(clip: NiumpiSemanticSpriteClip): { scene: "home" | "niumpi" | "room"; room?: RoomId; rootAnim: string; label?: string } {
  if (clip === "sad") return { scene: "niumpi", rootAnim: "sad" };
  if (clip === "lamp") return { scene: "home", rootAnim: "lamp" };
  if (clip === "sleep") return { scene: "home", rootAnim: "sleep" };
  if (clip === "read") return { scene: "room", room: "living-room", rootAnim: "read", label: "Story time" };
  if (clip === "dance") return { scene: "room", room: "living-room", rootAnim: "dance", label: "Little dance" };
  if (clip === "sing") return { scene: "room", room: "living-room", rootAnim: "sing", label: "Sing together" };
  if (clip === "cozy") return { scene: "room", room: "bedroom", rootAnim: "cozy", label: "Cozy rest" };
  if (clip === "roll") return { scene: "room", room: "play-nook", rootAnim: "roll", label: "Floor roll" };
  return { scene: "room", room: "living-room", rootAnim: "walk" };
}

async function triggerSemantic(page: Page, clip: Exclude<NiumpiSemanticSpriteClip, "travel" | "sleep">) {
  if (clip === "sad") return page.locator(".dock-dance").click();
  if (clip === "lamp") return page.getByRole("button", { name: "Lamp", exact: true }).click();
  const label = sceneAndRoomFor(clip).label;
  if (!label) throw new Error(`No real UI trigger for ${clip}`);
  return roomActivityButton(page, label).click();
}

function atlasSourcesFor(variant: NiumpiModelVariant, names: readonly string[]) {
  const manifest = manifestFor(variant);
  return names.flatMap((name) => {
    const clip = manifest.clips[name as NiumpiSemanticSpriteClip];
    if (!clip) return [];
    return ("pages" in clip.atlas ? clip.atlas.pages : [clip.atlas]).map((page) => (
      page.src.startsWith("/") ? page.src : `/assets/niumpi/v2/${variant}/${page.src.replace(/^\.\//, "")}`
    ));
  });
}

function assertSemanticAtlasesWereLazy(
  variant: NiumpiModelVariant,
  requestedUrls: readonly string[],
  active: NiumpiSemanticSpriteClip,
) {
  const requested = new Set(requestedUrls.map((url) => new URL(url).pathname));
  const activeSources = atlasSourcesFor(variant, [active]);
  expect(activeSources.some((src) => requested.has(src)), `${variant}/${active} atlas was never requested`).toBe(true);
  for (const other of Object.keys(EXPECTED_EVENTS) as NiumpiSemanticSpriteClip[]) {
    if (other === active) continue;
    for (const source of atlasSourcesFor(variant, [other])) {
      expect(requested.has(source), `unrelated semantic atlas loaded eagerly: ${variant}/${other}`).toBe(false);
    }
  }
}

async function runOneShot(
  page: Page,
  variant: NiumpiModelVariant,
  clipName: Exclude<NiumpiSemanticSpriteClip, "travel" | "sleep">,
  options: { mobile?: boolean; parity?: boolean } = {},
) {
  const meta = sceneAndRoomFor(clipName);
  const clip = semanticClip(variant, clipName);
  const requestedUrls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes(`/assets/niumpi/v2/${variant}/atlases/`)) requestedUrls.push(request.url());
  });
  const { root, canvas } = await openGame(page, variant, meta.scene, {
    tired: clipName === "sad",
    room: meta.room,
    mobile: options.mobile,
  });
  const before = await readLiveState(page);
  await installProductionTrace(root, canvas);
  await triggerSemantic(page, clipName);
  await expect(root).toHaveAttribute("data-anim", meta.rootAnim, { timeout: 5_000 });
  await expect(canvas).toHaveAttribute("data-clip", clipName, { timeout: 12_000 });
  await expect(canvas).not.toHaveAttribute("data-missing-semantic-clip", /.+/);

  const committed = await waitForActionCommit(page, before, clipName !== "sad");
  await expectClipPresentation(canvas, clipName);
  const gameProof = options.parity ? await pixelProof(canvas) : null;

  await expect.poll(async () => {
    const events = (await runtimeTrace(page)).events.filter((event) => event.clip === clipName && !event.synthetic);
    return events.length;
  }, { timeout: clip.durationMs + 10_000 }).toBe(clip.events.length);
  await expect.poll(async () => containsInOrder(transitions((await runtimeTrace(page)).frames), [clipName, "idle"]), { timeout: 8_000 })
    .toBe(true);

  const trace = await runtimeTrace(page);
  const events = trace.events.filter((event) => event.clip === clipName);
  assertObservedEventContract(events, clip);
  expect(transitions(trace.frames).filter((value) => value === clipName)).toHaveLength(1);
  assertFrameContract(trace.frames, clip, meta.rootAnim);
  await assertProductionEventParity(canvas, events, clipName);
  await expect(canvas).toHaveAttribute("data-presentation-prop", "none");
  await expectPresentationCleared(canvas);
  await expectStateStable(page, committed);
  assertSemanticAtlasesWereLazy(variant, requestedUrls, clipName);
  await expectNoOverflowAndBudget(page, canvas);
  if (gameProof) await compareGameLabParity(page, variant, clipName, gameProof);
}

async function runPersistentSleep(
  page: Page,
  variant: NiumpiModelVariant,
  options: { mobile?: boolean; parity?: boolean } = {},
) {
  const clip = semanticClip(variant, "sleep");
  const requestedUrls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes(`/assets/niumpi/v2/${variant}/atlases/`)) requestedUrls.push(request.url());
  });
  const { root, canvas } = await openGame(page, variant, "home", { mobile: options.mobile });
  const before = await readLiveState(page);
  await installProductionTrace(root, canvas);
  await page.getByRole("button", { name: "Tuck in", exact: true }).click();
  await expect(root).toHaveAttribute("data-anim", "sleep", { timeout: 5_000 });
  await expect(canvas).toHaveAttribute("data-clip", "sleep", { timeout: 12_000 });
  const asleep = await waitForActionCommit(page, before, true);
  expect(asleep.niumpi.sleeping).toBe(true);
  await expectPresentationVisible(canvas, "effect", "dream", ".nb-presentation-dream");
  const gameProof = options.parity ? await pixelProof(canvas) : null;

  await expect.poll(async () => {
    const frames = (await runtimeTrace(page)).frames
      .filter((entry) => entry.reason === "canvas" && entry.clip === "sleep")
      .map((entry) => entry.frame);
    return frames.filter((frame) => frame === 16).length;
  }, { timeout: 12_000 }).toBeGreaterThanOrEqual(2);

  const held = await runtimeTrace(page);
  expect(held.events.filter((event) => event.clip === "sleep" && event.type === "sleep_loop_enter")).toHaveLength(1);
  expect(held.frames.some((entry) => ["blink", "look_left", "look_right"].includes(entry.clip))).toBe(false);
  expect(held.frames.filter((entry) => entry.clip === "sleep").some((entry) => entry.frame >= 96)).toBe(false);

  await page.getByRole("button", { name: "Wake up", exact: true }).click();
  await expect.poll(async () => (await runtimeTrace(page)).events.some(
    (event) => event.clip === "sleep" && event.type === "sleep_exit",
  ), { timeout: 8_000 }).toBe(true);
  await expect.poll(async () => containsInOrder(transitions((await runtimeTrace(page)).frames), ["sleep", "idle"]), { timeout: 10_000 })
    .toBe(true);
  const awake = await waitForActionCommit(page, asleep, true);
  expect(awake.niumpi.sleeping).toBe(false);

  const trace = await runtimeTrace(page);
  const events = trace.events.filter((event) => event.clip === "sleep");
  assertObservedEventContract(events, clip);
  expect(events.filter((event) => event.type === "sleep_loop_enter")).toHaveLength(1);
  assertFrameContract(trace.frames, clip, "sleep");
  await assertProductionEventParity(canvas, events, "sleep");
  await expectPresentationCleared(canvas);
  await expectStateStable(page, awake);
  assertSemanticAtlasesWereLazy(variant, requestedUrls, "sleep");
  await expectNoOverflowAndBudget(page, canvas);
  if (gameProof) await compareGameLabParity(page, variant, "sleep", gameProof);
}

async function runTravel(
  page: Page,
  variant: NiumpiModelVariant,
  options: { mobile?: boolean; parity?: boolean } = {},
) {
  const clip = semanticClip(variant, "travel");
  const requestedUrls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes(`/assets/niumpi/v2/${variant}/atlases/`)) requestedUrls.push(request.url());
  });
  const { root, canvas } = await openGame(page, variant, "room", { room: "living-room", mobile: options.mobile });
  const before = await readLiveState(page);
  const origin = Number.parseFloat(await root.evaluate((element) => getComputedStyle(element).getPropertyValue("--rig-x"))) || 0;
  await installProductionTrace(root, canvas);
  await page.locator(".rw-room-tab.is-bedroom").click();
  await expect(page.locator(".rw-room-tab.is-bedroom")).toHaveAttribute("aria-pressed", "true");
  await expect(root).toHaveAttribute("data-travel-destination", "bedroom");
  await expect(root).toHaveAttribute("data-travel-destination-x", "48");
  await expect(canvas).toHaveAttribute("data-clip", "travel", { timeout: 12_000 });
  const committed = await waitForActionCommit(page, before, true);
  expect(committed.room.activeRoomId).toBe("bedroom");
  await expectPresentationVisible(canvas, "effect", "travel", ".nb-presentation-travel");
  const gameProof = options.parity ? await pixelProof(canvas) : null;
  await expect.poll(async () => Number.parseFloat(
    await root.evaluate((element) => getComputedStyle(element).getPropertyValue("--rig-x")),
  ), { timeout: 5_000 }).toBeGreaterThan(origin + 5);
  await expect.poll(async () => (await runtimeTrace(page)).events.filter(
    (event) => event.clip === "travel" && !event.synthetic,
  ).length, { timeout: clip.durationMs + 8_000 }).toBe(clip.events.length);
  await expect.poll(async () => containsInOrder(transitions((await runtimeTrace(page)).frames), ["travel", "idle"]), { timeout: 8_000 })
    .toBe(true);

  const trace = await runtimeTrace(page);
  const events = trace.events.filter((event) => event.clip === "travel");
  assertObservedEventContract(events, clip);
  expect(events.map((event) => event.type)).toEqual(clip.events.map((event) => event.type));
  expect(events.findIndex((event) => event.type === "travel_depart")).toBeLessThan(events.findIndex((event) => event.type === "travel_apex"));
  expect(events.findIndex((event) => event.type === "travel_apex")).toBeLessThan(events.findIndex((event) => event.type === "travel_land"));
  expect(events.findIndex((event) => event.type === "travel_land")).toBeLessThan(events.findIndex((event) => event.type === "travel_arrive"));
  const at = (type: string) => events.find((event) => event.type === type)?.rigX;
  expect(at("travel_depart")).toBeGreaterThan(origin + 20);
  expect(Math.abs((at("travel_apex") ?? 0) - 48)).toBeLessThanOrEqual(2);
  expect(Math.abs((at("travel_land") ?? 0) - 48)).toBeLessThanOrEqual(1);
  expect(Math.abs((at("travel_arrive") ?? 0) - 48)).toBeLessThanOrEqual(1);
  await page.waitForTimeout(180);
  expect(Math.abs((Number.parseFloat(await root.evaluate((element) => getComputedStyle(element).getPropertyValue("--rig-x"))) || 0) - 48)).toBeLessThanOrEqual(1);
  assertFrameContract(trace.frames, clip, "walk");
  await assertProductionEventParity(canvas, events, "travel");
  await expectPresentationCleared(canvas);
  await expectStateStable(page, committed);
  assertSemanticAtlasesWereLazy(variant, requestedUrls, "travel");
  await expectNoOverflowAndBudget(page, canvas);
  if (gameProof) await compareGameLabParity(page, variant, "travel", gameProof);
}

async function runInterruptedProp(page: Page, clipName: "read" | "cozy") {
  const variant = "baby" as const;
  const clip = semanticClip(variant, clipName);
  const meta = sceneAndRoomFor(clipName);
  const { root, canvas } = await openGame(page, variant, "room", { room: meta.room });
  const before = await readLiveState(page);
  await installProductionTrace(root, canvas);
  await triggerSemantic(page, clipName);
  await expect(canvas).toHaveAttribute("data-clip", clipName, { timeout: 12_000 });
  const prop = clipName === "read" ? "book" : "cozy-target";
  await expect(canvas).toHaveAttribute("data-presentation-prop", prop, { timeout: 4_000 });
  await expectPresentationVisible(
    canvas,
    "prop",
    prop,
    clipName === "read" ? ".nb-presentation-book" : ".nb-presentation-blanket",
  );
  const firstCommit = await waitForActionCommit(page, before, true);

  await page.getByRole("button", { name: "Pet Mango", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-clip", "tap_reaction", { timeout: 5_000 });
  await expect(canvas).toHaveAttribute("data-presentation-prop", "none");
  await expectPresentationCleared(canvas);
  const finalCommit = await waitForActionCommit(page, firstCommit, true);
  await expect.poll(async () => containsInOrder(transitions((await runtimeTrace(page)).frames), [clipName, "tap_reaction", "idle"]), { timeout: 10_000 })
    .toBe(true);

  const trace = await runtimeTrace(page);
  const events = trace.events.filter((event) => event.clip === clipName);
  expect(events.filter((event) => event.type === "prop_attach" && !event.synthetic)).toHaveLength(1);
  expect(events.filter((event) => event.type === "prop_detach" && event.synthetic)).toHaveLength(1);
  expect(events.filter((event) => event.type === "prop_detach" && !event.synthetic)).toHaveLength(0);
  const cleanup = events.find((event) => event.type === "prop_detach");
  const attach = events.find((event) => event.type === "prop_attach");
  expect(cleanup?.payload?.prop).toBe(prop);
  expect(cleanup?.authoredFrame).toBe(clip.events.find((event) => event.type === "prop_attach")?.frame);
  expect(cleanup?.spriteToken).toBe(attach?.spriteToken);
  expect(cleanup?.sequence).toBeGreaterThan(attach?.sequence ?? 0);
  expect(transitions(trace.frames).filter((entry) => entry === clipName)).toHaveLength(1);
  await assertProductionEventParity(canvas, events, clipName);
  await expectStateStable(page, finalCommit);
}

type PixelProof = { frame: number; rect: string; src: string; pixels: number[] };

async function pixelProof(canvas: Locator): Promise<PixelProof> {
  return canvas.evaluate(async (element) => {
    const source = element as HTMLCanvasElement;
    const atlasSrc = source.dataset.atlasSrc;
    const rect = source.dataset.atlasRect ?? "";
    const [x, y, width, height] = rect.split(",").map(Number);
    if (!atlasSrc || ![x, y, width, height].every(Number.isFinite)) {
      throw new Error("Pixel parity atlas source is unavailable");
    }
    const atlas = new Image();
    atlas.src = atlasSrc;
    await atlas.decode();
    const sample = document.createElement("canvas");
    sample.width = 32;
    sample.height = 32;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Pixel parity Canvas is unavailable");
    context.drawImage(atlas, x, y, width, height, 0, 0, 32, 32);
    return {
      frame: Number(source.dataset.frame),
      rect,
      src: new URL(atlasSrc, window.location.href).href,
      pixels: Array.from(context.getImageData(0, 0, 32, 32).data),
    };
  });
}

function pixelMae(left: readonly number[], right: readonly number[]) {
  expect(left.length).toBe(right.length);
  return left.reduce((sum, value, index) => sum + Math.abs(value - right[index]), 0) / left.length;
}

async function setLabFrame(page: Page, frame: number) {
  const slider = page.getByLabel("Animation frame");
  await slider.fill(String(frame));
  await expect(slider).toHaveValue(String(frame));
  await expect.poll(async () => Number(await page.locator(".animation-lab-stage canvas").getAttribute("data-frame"))).toBe(frame);
}

async function assertLabKeyboardStep(page: Page, frame: number) {
  const slider = page.getByLabel("Animation frame");
  await slider.focus();
  await slider.press("ArrowRight");
  await expect(slider).toHaveValue(String(frame + 1));
  await expect.poll(async () => Number(await page.locator(".animation-lab-stage canvas").getAttribute("data-frame"))).toBe(frame + 1);
  await slider.press("ArrowLeft");
  await expect(slider).toHaveValue(String(frame));
  await expect.poll(async () => Number(await page.locator(".animation-lab-stage canvas").getAttribute("data-frame"))).toBe(frame);
}

async function compareGameLabParity(
  page: Page,
  variant: NiumpiModelVariant,
  clipName: NiumpiSemanticSpriteClip,
  game: PixelProof,
) {
  const clip = semanticClip(variant, clipName);
  await page.goto("/?animation-lab=1", { waitUntil: "domcontentloaded" });
  const select = page.locator(".animation-lab-panel select").first();
  await expect(select.locator("option")).toHaveText(DECLARED_VARIANTS);
  await select.selectOption(variant);
  const labCanvas = page.locator(".animation-lab-stage canvas.nb-frame-canvas");
  await expect(labCanvas).toHaveAttribute("data-variant", variant, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: clipName, exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: clipName, exact: true }).click();
  await expect(labCanvas).toHaveAttribute("data-clip", clipName, { timeout: 15_000 });
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await setLabFrame(page, game.frame);
  if (game.frame < clip.frameCount - 1) await assertLabKeyboardStep(page, game.frame);
  const lab = await pixelProof(labCanvas);
  expect(lab.src).toBe(game.src);
  expect(lab.rect).toBe(game.rect);
  expect(pixelMae(lab.pixels, game.pixels), `${variant}/${clipName} Game/Lab pixel parity`).toBeLessThanOrEqual(2);

  const actionFrame = clip.transition.anticipationFrames + Math.floor(clip.transition.actionFrames / 2);
  const recoveryFrame = clip.transition.anticipationFrames + clip.transition.actionFrames;
  const poses: PixelProof[] = [];
  for (const frame of [0, actionFrame, recoveryFrame]) {
    await setLabFrame(page, frame);
    poses.push(await pixelProof(labCanvas));
  }
  expect(pixelMae(poses[0].pixels, poses[1].pixels), `${variant}/${clipName} anticipation→peak delta`).toBeGreaterThan(0.2);
  expect(pixelMae(poses[1].pixels, poses[2].pixels), `${variant}/${clipName} peak→recovery delta`).toBeGreaterThan(0.2);
  await expect(labCanvas).not.toHaveAttribute("data-missing-semantic-clip", /.+/);
  await expect(labCanvas).not.toHaveAttribute("data-error", /.+/);
  await expectNoOverflowAndBudget(page, labCanvas);
}

async function runReducedSleep(page: Page, mobile = false) {
  const variant = "baby" as const;
  const clip = semanticClip(variant, "sleep");
  const pose = clip.playback!.reducedPoseFrame;
  const { root, player, canvas } = await openGame(page, variant, "home", { reduced: true, mobile });
  await installProductionTrace(root, canvas);
  const before = await readLiveState(page);
  await page.getByRole("button", { name: "Tuck in", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-clip", "sleep", { timeout: 12_000 });
  const asleep = await waitForActionCommit(page, before, true);
  await expectPresentationVisible(canvas, "effect", "dream", ".nb-presentation-dream");
  await expect.poll(async () => Number(await canvas.getAttribute("data-frame")), { timeout: 5_000 }).toBe(pose);
  await page.waitForTimeout(700);
  expect(Number(await canvas.getAttribute("data-frame"))).toBe(pose);
  const held = await runtimeTrace(page);
  expect(held.events.filter((event) => event.clip === "sleep").map((event) => event.type)).toEqual(["sleep_eyes_closed"]);
  expect(held.frames.some((entry) => ["blink", "look_left", "look_right"].includes(entry.clip))).toBe(false);
  await page.getByRole("button", { name: "Wake up", exact: true }).click();
  await expect.poll(async () => containsInOrder(transitions((await runtimeTrace(page)).frames), ["sleep", "idle"]), { timeout: 8_000 }).toBe(true);
  const awake = await waitForActionCommit(page, asleep, true);
  const trace = await runtimeTrace(page);
  assertFrameContract(trace.frames, clip, "sleep");
  await expect(player.locator(".nb-frame-fallback")).toBeHidden();
  await expectPresentationCleared(canvas);
  await expectStateStable(page, awake);
  await expectNoOverflowAndBudget(page, canvas);
}

async function runReducedOneShot(
  page: Page,
  clipName: Exclude<NiumpiSemanticSpriteClip, "travel" | "sleep">,
  mobile = false,
) {
  const variant = "baby" as const;
  const meta = sceneAndRoomFor(clipName);
  const clip = semanticClip(variant, clipName);
  const expected = reducedEventsForClip(clip);
  const { root, player, canvas } = await openGame(page, variant, meta.scene, {
    tired: clipName === "sad",
    room: meta.room,
    reduced: true,
    mobile,
  });
  await installProductionTrace(root, canvas);
  const before = await readLiveState(page);
  await triggerSemantic(page, clipName);
  await expect(root).toHaveAttribute("data-anim", meta.rootAnim);
  await expect(canvas).toHaveAttribute("data-clip", clipName, { timeout: 12_000 });
  await expect(player).toHaveClass(/is-reduced/);
  await expect(canvas).toHaveAttribute("data-motion-mode", "reduced");
  await expectClipPresentation(canvas, clipName);
  const committed = await waitForActionCommit(page, before, clipName !== "sad");
  await expect.poll(async () => containsInOrder(transitions((await runtimeTrace(page)).frames), [clipName, "idle"]), { timeout: 8_000 }).toBe(true);
  const trace = await runtimeTrace(page);
  const events = trace.events.filter((event) => event.clip === clipName);
  expect(eventProjection(events)).toEqual(expected.map((event) => ({
    authoredFrame: event.frame,
    type: event.type,
    payload: event.payload,
    synthetic: false,
  })));
  expect(trace.frames.some((entry) => ["blink", "look_left", "look_right"].includes(entry.clip))).toBe(false);
  assertFrameContract(trace.frames, clip, meta.rootAnim);
  await expect(player.locator(".nb-frame-fallback")).toBeHidden();
  await expectPresentationCleared(canvas);
  await expectStateStable(page, committed);
  await expectNoOverflowAndBudget(page, canvas);
}

async function runReducedTravel(page: Page, mobile = false) {
  const variant = "baby" as const;
  const clip = semanticClip(variant, "travel");
  const expected = reducedEventsForClip(clip);
  const { root, player, canvas } = await openGame(page, variant, "room", {
    room: "living-room",
    reduced: true,
    mobile,
  });
  await installProductionTrace(root, canvas);
  const before = await readLiveState(page);
  await page.locator(".rw-room-tab.is-bedroom").click();
  await expect(canvas).toHaveAttribute("data-clip", "travel", { timeout: 12_000 });
  await expect(root).toHaveAttribute("data-travel-translation-suppressed", "true");
  await expectPresentationVisible(canvas, "effect", "travel", ".nb-presentation-travel");
  const committed = await waitForActionCommit(page, before, true);
  expect(committed.room.activeRoomId).toBe("bedroom");
  await expect.poll(async () => containsInOrder(transitions((await runtimeTrace(page)).frames), ["travel", "idle"]), { timeout: 8_000 }).toBe(true);
  const trace = await runtimeTrace(page);
  const events = trace.events.filter((event) => event.clip === "travel");
  expect(eventProjection(events)).toEqual(expected.map((event) => ({
    authoredFrame: event.frame,
    type: event.type,
    payload: event.payload,
    synthetic: false,
  })));
  for (const entry of trace.frames.filter((candidate) => candidate.clip === "travel")) {
    expect(Math.abs(entry.rigX)).toBeLessThanOrEqual(0.25);
  }
  assertFrameContract(trace.frames, clip, "walk");
  await expect(player.locator(".nb-frame-fallback")).toBeHidden();
  await expectPresentationCleared(canvas);
  await expectStateStable(page, committed);
  await expectNoOverflowAndBudget(page, canvas);
}

async function runReducedSemanticPath(page: Page, clip: NiumpiSemanticSpriteClip, mobile = false) {
  if (clip === "travel") return runReducedTravel(page, mobile);
  if (clip === "sleep") return runReducedSleep(page, mobile);
  return runReducedOneShot(page, clip, mobile);
}

async function runFullSemanticPath(
  page: Page,
  variant: NiumpiModelVariant,
  clip: NiumpiSemanticSpriteClip,
  options: { mobile?: boolean; parity?: boolean } = {},
) {
  if (clip === "travel") return runTravel(page, variant, options);
  if (clip === "sleep") return runPersistentSleep(page, variant, options);
  return runOneShot(page, variant, clip, options);
}

test.describe("semantic animation release gate", { tag: "@semantic-animation-gate" }, () => {
  test.skip(!REQUIRE_SEMANTIC, "Set NIUMPI_REQUIRE_SEMANTIC=1 only after all ninety semantic clips and atlases exist");

  test("all ten declared variants expose every real semantic clip in their manifests and Lab catalog", async ({ page }) => {
    test.setTimeout(60_000);
    for (const variant of DECLARED_VARIANTS) {
      const manifest = manifestFor(variant);
      for (const name of Object.keys(EXPECTED_EVENTS) as NiumpiSemanticSpriteClip[]) semanticClip(variant, name);
      expect(Object.keys(manifest.clips)).toEqual(expect.arrayContaining(Object.keys(EXPECTED_EVENTS)));
    }
    await page.goto("/?animation-lab=1", { waitUntil: "domcontentloaded" });
    const select = page.locator(".animation-lab-panel select").first();
    await expect(select.locator("option")).toHaveText(DECLARED_VARIANTS);
    for (const variant of DECLARED_VARIANTS) {
      await select.selectOption(variant);
      const player = page.locator(`.animation-lab-stage .nb-frame-player[data-variant="${variant}"]`);
      const canvas = player.locator("canvas.nb-frame-canvas");
      await expect(player).not.toHaveClass(/is-loading|is-error/, { timeout: 30_000 });
      await expect(canvas).toHaveAttribute("data-variant", variant);
      await expect(canvas).not.toHaveAttribute("data-missing-semantic-clip", /.+/);
      await expect(player.locator(".nb-frame-fallback")).toBeHidden();
      const buttons = page.locator(".animation-lab-buttons button");
      for (const name of Object.keys(EXPECTED_EVENTS)) {
        await expect(buttons.filter({ hasText: new RegExp(`^${name}$`) })).toHaveCount(1, { timeout: 30_000 });
      }
    }
  });

  test("baby/read: a page stall longer than the semantic defers root idle and resumes without marker burst", async ({ page }) => {
    test.setTimeout(35_000);
    const readSource = atlasSourcesFor("baby", ["read"])[0];
    let releasePage!: () => void;
    let markIntercepted!: () => void;
    const intercepted = new Promise<void>((resolve) => { markIntercepted = resolve; });
    const holdPage = new Promise<void>((resolve) => { releasePage = resolve; });
    let held = false;
    await page.route("**/*", async (route) => {
      if (!held && new URL(route.request().url()).pathname === readSource) {
        held = true;
        markIntercepted();
        await holdPage;
      }
      await route.continue();
    });

    const { root, canvas } = await openGame(page, "baby", "room", { room: "living-room" });
    await installProductionTrace(root, canvas);
    await triggerSemantic(page, "read");
    await intercepted;
    await expect(root).toHaveAttribute("data-anim", "read", { timeout: 4_000 });
    await expect(canvas).toHaveAttribute("data-suspended-by", /atlas/);
    await expect(root).toHaveAttribute("data-anim", "idle", { timeout: 12_000 });
    releasePage();

    await expect(canvas).toHaveAttribute("data-clip", "read", { timeout: 10_000 });
    expect(Number(await canvas.getAttribute("data-frame"))).toBeLessThanOrEqual(3);
    const earlyEvents = (await runtimeTrace(page)).events.filter((event) => event.clip === "read");
    expect(earlyEvents.map((event) => event.type)).toEqual(["clip_start"]);
    await expect.poll(async () => transitions((await runtimeTrace(page)).frames), { timeout: 8_000 })
      .toEqual(expect.arrayContaining(["read", "idle"]));
  });

  const clips = Object.keys(EXPECTED_EVENTS) as NiumpiSemanticSpriteClip[];
  for (const viewport of ["desktop", "mobile"] as const) {
    for (const variant of DECLARED_VARIANTS) {
      for (const clip of clips) {
        test(`${viewport}/${variant}/${clip}: real trigger, controller-sync, canonical events and full-state persistence`, async ({ page }) => {
          test.setTimeout(viewport === "desktop" ? 75_000 : 55_000);
          const errors = captureRuntimeErrors(page);
          await runFullSemanticPath(page, variant, clip, {
            mobile: viewport === "mobile",
            // Every authored clip is compared to Lab once; mobile repeats the
            // real scene/interaction and layout gate without doubling Lab IO.
            parity: viewport === "desktop",
          });
          expect(errors).toEqual([]);
        });
      }
    }
  }

  for (const clip of ["read", "cozy"] as const) {
    test(`baby/${clip}: interruption synthesizes one production prop_detach with payload and no replay`, async ({ page }) => {
      test.setTimeout(40_000);
      const errors = captureRuntimeErrors(page);
      await runInterruptedProp(page, clip);
      expect(errors).toEqual([]);
    });
  }

  for (const clip of clips) {
    test(`reduced/mobile/baby/${clip}: shared root+Canvas timeline and authored low-motion event subset`, async ({ page }) => {
      test.setTimeout(45_000);
      const errors = captureRuntimeErrors(page);
      await runReducedSemanticPath(page, clip, true);
      expect(errors).toEqual([]);
    });
  }
});
