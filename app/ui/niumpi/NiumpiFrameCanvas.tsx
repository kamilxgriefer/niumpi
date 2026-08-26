"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Art } from "../Art.tsx";
import { foodPropStateAtFrame } from "../../anim/NiumpiFoodProp.ts";
import {
  loadSpriteAtlas,
  loadSpriteManifest,
  MAX_GLOBAL_ATLAS_DECODED_BYTES,
  reloadSpriteManifest,
  releaseSpriteAtlas,
  SPRITE_ASSET_FAILURE_BACKOFF_MS,
  spriteAtlasCacheStatsForTests,
  spriteRecoveryAdvancesGeneration,
} from "../../anim/NiumpiSpriteAssets.ts";
import type { NiumpiModelVariant } from "../../anim/NiumpiModelVariants.ts";
import {
  decodedBytesForAtlasPage,
  elapsedAtFrame,
  frameIndexAtControllerPhase,
  frameIndexAtElapsed,
  isSemanticSpriteClip,
  motionGateForClip,
  NIUMPI_SPRITE_CLOCK_RESUME_EVENT,
  NiumpiSpriteMachine,
  preservesSpritePresentationEventWindow,
  reducedEventsForClip,
  reducedFrameIndexAtElapsed,
  reducedFrameIndexAtControllerPhase,
  resolveManifestClip,
  resolveSpriteControllerSource,
  rigAllowsAmbient,
  spriteFrameDestinationRect,
  spriteClockShiftOnResume,
  spritePresentationEventsForStep,
  spritePhaseAtFrame,
  SpritePresentationEventLedger,
  SpritePlaybackSuspension,
  SpriteIntentGate,
  spriteIntentForRigRoot,
  type NiumpiSpriteClip,
  type NiumpiSpriteManifest,
  type SpriteClip,
  type SpriteControllerIntentSource,
  type SpriteControllerSource,
  type SpritePhase,
  type SpritePresentationEventDetail,
  type SpriteMachineSnapshot,
} from "../../anim/NiumpiSpriteRuntime.ts";
import { onMotionChange, prefersReducedMotion } from "../../anim/motionPrefs.ts";

export type { NiumpiSpriteClip } from "../../anim/NiumpiSpriteRuntime.ts";

export type FramePlayerSnapshot = SpriteMachineSnapshot & {
  frame: number;
  totalFrames: number;
  fps: number;
  playing: boolean;
  loop: boolean;
  motionGate: "PASS" | "FAIL";
};

type Props = {
  variant: NiumpiModelVariant;
  fallback: string;
  entrance?: boolean;
  forcedClip?: NiumpiSpriteClip;
  playing?: boolean;
  restartToken?: number;
  frameOverride?: number | null;
  loopOverride?: boolean;
  showAnchor?: boolean;
  onFrame?: (snapshot: FramePlayerSnapshot) => void;
  onEvent?: (
    name: string,
    clip: NiumpiSpriteClip,
    frame: number,
    detail?: SpritePresentationEventDetail,
  ) => void;
};

type LiveControls = Pick<Props,
  "forcedClip" | "playing" | "restartToken" | "frameOverride" | "loopOverride" | "onFrame" | "onEvent"
>;

type LoadedAtlasPage = { image: HTMLImageElement; src: string; bytes: number; lastUsed: number };
type LoadedClipAtlas = { pages: Map<number, LoadedAtlasPage> };
type PendingClipAtlas = { promise: Promise<LoadedClipAtlas>; demand: boolean };

// Keeps idle + the direct tap reaction hot on mobile, while preventing the
// previous 200+ MiB hatch/feed working sets from accumulating.
const MAX_LOCAL_DECODED_BYTES = MAX_GLOBAL_ATLAS_DECODED_BYTES;

function resolveAtlasUrl(src: string, variant: NiumpiModelVariant) {
  if (src.startsWith("/") || /^https?:\/\//.test(src)) return src;
  return `/assets/niumpi/v2/${variant}/${src.replace(/^\.\//, "")}`;
}

function nextAmbientDelay() {
  return 2_500 + Math.random() * 3_500;
}

function canWarmInteractionAtlas() {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  return !connection?.saveData && !/^(slow-)?2g$/i.test(connection?.effectiveType ?? "");
}

type FoodLook = { main: string; accent: string; shape: "berry" | "puff" | "drop" | "seed" | "mushroom" | "fruit" | "nut" | "pearl" | "leaf" | "candy" };

const FOOD_LOOKS: Record<string, FoodLook> = {
  moonberry: { main: "#8e65e8", accent: "#76e0c2", shape: "berry" },
  cloudpuff: { main: "#fff9ef", accent: "#c5eafb", shape: "puff" },
  dewdrop: { main: "#58d9df", accent: "#b9f7f2", shape: "drop" },
  sunseed: { main: "#ffc653", accent: "#ff846d", shape: "seed" },
  heartberry: { main: "#f06991", accent: "#8ce0a4", shape: "berry" },
  dreammint: { main: "#9c8ce8", accent: "#8de1c3", shape: "leaf" },
  starmush: { main: "#b889ed", accent: "#ffda76", shape: "mushroom" },
  emberfruit: { main: "#f27858", accent: "#ffcd65", shape: "fruit" },
  frostpetal: { main: "#9de8f0", accent: "#d9f6ff", shape: "leaf" },
  honeydew: { main: "#f2c96f", accent: "#9ed39a", shape: "fruit" },
  gigglenut: { main: "#b77954", accent: "#f7a7bf", shape: "nut" },
  tidepearl: { main: "#7ddbd2", accent: "#c8f2ff", shape: "pearl" },
  auroraleaf: { main: "#8edfd0", accent: "#cb9bed", shape: "leaf" },
  rootcandy: { main: "#e89968", accent: "#8bd07b", shape: "candy" },
};

function drawFoodProp(context: CanvasRenderingContext2D, width: number, height: number, state: ReturnType<typeof foodPropStateAtFrame>) {
  if (!state.active) return;
  const look = FOOD_LOOKS[state.id] ?? FOOD_LOOKS.moonberry;
  context.save();
  context.scale(width / 512, height / 512);
  context.translate(state.x, state.y);
  context.rotate(state.rotation);
  context.scale(state.scale, state.scale);
  context.shadowColor = "rgb(42 20 66 / 28%)";
  context.shadowBlur = 9;
  context.shadowOffsetY = 5;
  context.fillStyle = look.main;
  context.strokeStyle = "rgb(255 255 255 / 72%)";
  context.lineWidth = 2;
  context.beginPath();
  if (look.shape === "puff") {
    context.arc(-10, 1, 13, 0, Math.PI * 2);
    context.arc(5, -7, 15, 0, Math.PI * 2);
    context.arc(14, 5, 12, 0, Math.PI * 2);
  } else if (look.shape === "drop") {
    context.moveTo(0, -24); context.bezierCurveTo(20, -4, 18, 18, 0, 22); context.bezierCurveTo(-18, 18, -20, -4, 0, -24);
  } else if (look.shape === "seed" || look.shape === "nut") {
    context.ellipse(0, 0, 18, 23, look.shape === "seed" ? 0.45 : -0.18, 0, Math.PI * 2);
  } else if (look.shape === "mushroom") {
    context.moveTo(-23, 2); context.quadraticCurveTo(0, -25, 23, 2); context.quadraticCurveTo(0, 12, -23, 2);
  } else if (look.shape === "leaf") {
    context.moveTo(-23, 13); context.bezierCurveTo(-18, -22, 17, -28, 24, -13); context.bezierCurveTo(18, 13, -8, 27, -23, 13);
  } else if (look.shape === "candy") {
    context.roundRect(-19, -15, 38, 30, 10);
  } else {
    context.ellipse(0, 1, 21, look.shape === "pearl" ? 21 : 19, 0, 0, Math.PI * 2);
  }
  context.fill();
  context.stroke();
  context.shadowColor = "transparent";
  context.fillStyle = look.accent;
  context.beginPath();
  if (look.shape === "mushroom") context.roundRect(-7, 0, 14, 24, 6);
  else if (look.shape === "candy") {
    context.moveTo(-19, -8); context.lineTo(-31, -17); context.lineTo(-29, 11); context.closePath();
    context.moveTo(19, -8); context.lineTo(31, -17); context.lineTo(29, 11); context.closePath();
  } else if (look.shape === "leaf") {
    context.moveTo(-17, 11); context.quadraticCurveTo(2, 0, 20, -14); context.lineTo(17, -10); context.quadraticCurveTo(0, 5, -17, 14); context.closePath();
  } else {
    context.ellipse(8, -13, 7, 12, -0.55, 0, Math.PI * 2);
  }
  context.fill();
  context.fillStyle = "rgb(255 255 255 / 45%)";
  context.beginPath();
  context.ellipse(-7, -8, 5, 8, -0.6, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

/**
 * Production Canvas atlas player shared verbatim by gameplay and Animation
 * Lab. React owns controls and lifecycle; requestAnimationFrame owns drawing.
 */
export function NiumpiFrameCanvas({
  variant,
  fallback,
  entrance = false,
  forcedClip,
  playing = true,
  restartToken = 0,
  frameOverride = null,
  loopOverride,
  showAnchor = false,
  onFrame,
  onEvent,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const presentationRef = useRef<HTMLSpanElement>(null);
  const controlsRef = useRef<LiveControls>({ forcedClip, playing, restartToken, frameOverride, loopOverride, onFrame, onEvent });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [manifest, setManifest] = useState<NiumpiSpriteManifest | null>(null);
  const [assetReloadToken, setAssetReloadToken] = useState(0);
  const recoveryRef = useRef<{
    variant: NiumpiModelVariant;
    attempts: number;
    terminal: boolean;
    pending: boolean;
    reloadedToken: number;
    staleManifest: NiumpiSpriteManifest | null;
  }>({ variant, attempts: 0, terminal: false, pending: false, reloadedToken: -1, staleManifest: null });

  useEffect(() => {
    controlsRef.current = { forcedClip, playing, restartToken, frameOverride, loopOverride, onFrame, onEvent };
  }, [forcedClip, frameOverride, loopOverride, onEvent, onFrame, playing, restartToken]);

  useEffect(() => {
    const applyPreference = () => setReducedMotion(prefersReducedMotion());
    applyPreference();
    return onMotionChange(applyPreference);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const presentation = presentationRef.current;
    if (!canvas) return;
    if (recoveryRef.current.variant !== variant) {
      recoveryRef.current = {
        variant, attempts: 0, terminal: false, pending: false,
        reloadedToken: assetReloadToken, staleManifest: null,
      };
    }
    setReady(false);
    setFailed(false);
    setManifest(null);
    canvas.dataset.variant = variant;
    canvas.dataset.requestedVariant = variant;
    canvas.dataset.presentationProp = "none";
    canvas.dataset.presentationEventCount = "0";
    canvas.dataset.presentationTrace = "[]";
    canvas.dataset.assetRecovery = recoveryRef.current.attempts > 0 ? "reloading" : "none";
    canvas.dataset.assetRecoveryAttempts = String(recoveryRef.current.attempts);
    canvas.dataset.suspendedBy = "";
    delete canvas.dataset.deferredRootIntent;
    delete canvas.dataset.protectedSuspendedToken;
    if (recoveryRef.current.attempts === 0) delete canvas.dataset.assetRecoveryGeneration;
    delete canvas.dataset.presentationEvent;
    delete canvas.dataset.error;
    delete canvas.dataset.schemaVersion;
    delete canvas.dataset.renderer;
    delete canvas.dataset.clip;
    delete canvas.dataset.frame;
    canvas.dataset.motionMode = reducedMotion ? "reduced" : "full";
    delete canvas.dataset.missingSemanticClip;

    const context = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!context) {
      setFailed(true);
      canvas.dataset.error = "Canvas 2D is unavailable";
      return;
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    let disposed = false;
    let frameRequest = 0;
    let warmTimer = 0;
    let recoveryTimer = 0;
    let manifestValue: NiumpiSpriteManifest | null = null;
    let machine: NiumpiSpriteMachine | null = null;
    let observer: MutationObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    let lastFrame = -1;
    let lastToken = -1;
    let lastForced: NiumpiSpriteClip | undefined;
    let lastRestartToken = restartToken;
    let lastFrameOverride: number | null | undefined = frameOverride;
    let lastPlaying = playing;
    let pausedAt = 0;
    let nextAmbientAt = performance.now() + nextAmbientDelay();
    let eventToken = -1;
    let eventClip: NiumpiSpriteClip | null = null;
    let eventSequence = 0;
    let sourceIntent: SpriteControllerIntentSource | null = null;
    let pendingCompletedSnapshot: SpriteMachineSnapshot | null = null;
    const firedEvents = new Set<string>();
    const presentationTrace: SpritePresentationEventDetail[] = [];
    const atlases = new Map<NiumpiSpriteClip, LoadedClipAtlas>();
    const pendingAtlases = new Map<string, PendingClipAtlas>();
    // Exactly one shared-cache reference per page owned by this mounted player,
    // including pages that are still decoding when a variant switches.
    const ownedAtlasSources = new Set<string>();
    const suspension = new SpritePlaybackSuspension();
    let deferredRootIntent = false;
    let deferredIntentStartFloor: number | null = null;
    let protectedSuspendedToken: number | null = null;
    let suspendedRootMotionToken: string | null = null;
    const intentGate = new SpriteIntentGate();
    const presentationEvents = new SpritePresentationEventLedger();
    const root = canvas.closest<HTMLElement>(".rig-root");
    const numberFromDataset = (value: string | undefined, fallback: number) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const controllerSourceFromRoot = (): SpriteControllerSource => {
      const at = performance.now();
      return {
        token: root?.dataset.motionToken ?? "unknown",
        anim: root?.dataset.anim ?? "idle",
        phase: root?.dataset.phase ?? "action",
        enteredAt: numberFromDataset(root?.dataset.motionEnteredAt, at),
        phaseStartedAt: numberFromDataset(root?.dataset.phaseStartedAt, at),
        phaseEndsAt: root?.dataset.phaseEndsAt === "none"
          ? null
          : numberFromDataset(root?.dataset.phaseEndsAt, at),
      };
    };
    let presentationToken = -1;
    const resetPresentation = (token: number) => {
      if (!presentation) return;
      presentationToken = token;
      presentation.dataset.spriteToken = String(token);
      presentation.dataset.presentationProp = "none";
      presentation.dataset.presentationEffect = "none";
      presentation.dataset.presentationEvent = "none";
    };
    const consumePresentationEvent = (detail: SpritePresentationEventDetail, prop: string) => {
      if (!presentation || detail.spriteToken < presentationToken) return;
      if (detail.spriteToken !== presentationToken) resetPresentation(detail.spriteToken);
      presentation.dataset.presentationEvent = detail.type;
      presentation.dataset.presentationProp = prop;
      if (detail.type === "lamp_glow") presentation.dataset.presentationEffect = "glow";
      else if (detail.type === "vocal_phrase" || detail.type === "dance_beat") presentation.dataset.presentationEffect = "note";
      else if (detail.type === "sleep_eyes_closed" || detail.type === "cozy_contact") presentation.dataset.presentationEffect = "dream";
      else if (detail.type === "travel_depart" || detail.type === "travel_apex" || detail.type === "travel_land" || detail.type === "roll_launch") presentation.dataset.presentationEffect = "travel";
      else if (detail.type === "sad_sigh") presentation.dataset.presentationEffect = "sigh";
      if (detail.type === "prop_detach") presentation.dataset.presentationProp = "none";
    };
    const emitPresentationEvent = (
      event: {
        type: string;
        clip: NiumpiSpriteClip;
        authoredFrame: number;
        observedFrame: number;
        payload?: Record<string, string | number | boolean>;
      },
      synthetic: boolean,
      spriteToken: number,
    ) => {
      eventSequence += 1;
      const detail: SpritePresentationEventDetail = {
        sequence: eventSequence,
        type: event.type,
        clip: event.clip,
        authoredFrame: event.authoredFrame,
        observedFrame: event.observedFrame,
        payload: event.payload ? { ...event.payload } : undefined,
        synthetic,
        spriteToken,
      };
      const presentationProp = presentationEvents.presentationProp() ?? "none";
      canvas.dataset.presentationProp = presentationProp;
      canvas.dataset.presentationEvent = JSON.stringify(detail);
      canvas.dataset.presentationEventCount = String(eventSequence);
      presentationTrace.push(detail);
      if (presentationTrace.length > 96) presentationTrace.splice(0, presentationTrace.length - 96);
      canvas.dataset.presentationTrace = JSON.stringify(presentationTrace);
      consumePresentationEvent(detail, presentationProp);
      canvas.dispatchEvent(new CustomEvent<SpritePresentationEventDetail>("niumpi:presentation-event", {
        bubbles: true,
        detail,
      }));
      controlsRef.current.onEvent?.(event.type, event.clip, event.observedFrame, detail);
    };
    const emitEventsThrough = (
      clip: SpriteClip,
      observedFrame: number,
      spriteToken: number,
      options: { exitActive?: boolean; terminal?: boolean } = {},
    ) => {
      const playbackEvents = reducedMotion ? reducedEventsForClip(clip) : (clip.events ?? []);
      for (const step of spritePresentationEventsForStep(
        clip,
        playbackEvents,
        firedEvents,
        observedFrame,
        options,
      )) {
        firedEvents.add(step.key);
        presentationEvents.observe(step.event, clip.name, step.observedFrame, spriteToken);
        emitPresentationEvent({
          type: step.event.type,
          clip: clip.name,
          authoredFrame: step.event.frame,
          observedFrame: step.observedFrame,
          payload: step.event.payload,
        }, false, spriteToken);
      }
    };
    const fail = (error: unknown) => {
      if (disposed) return;
      const recovery = recoveryRef.current;
      if (recovery.pending) return;
      if (!recovery.terminal && recovery.attempts === 0 && !recoveryTimer) {
        recovery.attempts = 1;
        recovery.pending = true;
        recovery.staleManifest = manifestValue;
        setReady(false);
        canvas.dataset.assetRecovery = "backoff";
        canvas.dataset.assetRecoveryAttempts = "1";
        suspend("atlas");
        recoveryTimer = window.setTimeout(() => {
          recoveryTimer = 0;
          if (!disposed && recoveryRef.current.variant === variant) {
            setAssetReloadToken((token) => token + 1);
          }
        }, SPRITE_ASSET_FAILURE_BACKOFF_MS);
        return;
      }
      if (recoveryTimer) return;
      recovery.terminal = true;
      setReady(false);
      setFailed(true);
      canvas.dataset.assetRecovery = "terminal";
      canvas.dataset.error = error instanceof Error ? error.message : "Niumpi sprite load failed";
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(64, Math.round(bounds.width * dpr));
      const height = Math.max(64, Math.round(bounds.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        lastFrame = -1;
      }
      canvas.dataset.buffer = `${width}x${height}`;
    };

    let activePageKey = "";
    const pruneDecodedPages = (protectedPages: Set<string>) => {
      const candidates = [...atlases.entries()].flatMap(([clipName, entry]) => (
        [...entry.pages.entries()].map(([index, loadedPage]) => ({
          clip: clipName, index, key: `${clipName}:${index}`, page: loadedPage,
        }))
      )).sort((left, right) => left.page.lastUsed - right.page.lastUsed);
      let decodedBytes = candidates.reduce((total, entry) => total + entry.page.bytes, 0);
      for (const candidate of candidates) {
        if (decodedBytes <= MAX_LOCAL_DECODED_BYTES) break;
        if (protectedPages.has(candidate.key)) continue;
        atlases.get(candidate.clip)?.pages.delete(candidate.index);
        if (atlases.get(candidate.clip)?.pages.size === 0) atlases.delete(candidate.clip);
        ownedAtlasSources.delete(candidate.page.src);
        releaseSpriteAtlas(candidate.page.src);
        decodedBytes -= candidate.page.bytes;
      }
      canvas.dataset.decodedBytes = String(decodedBytes);
      canvas.dataset.decodedBudget = String(MAX_LOCAL_DECODED_BYTES);
      const globalCache = spriteAtlasCacheStatsForTests();
      canvas.dataset.globalDecodedBytes = String(globalCache.retainedDecodedBytes);
      canvas.dataset.globalDecodedBudget = String(globalCache.budgetBytes);
    };

    const atlasFor = (clip: NiumpiSpriteClip, pageIndex = 0, purpose: "demand" | "prefetch" = "demand") => {
      const cacheKey = `${clip}:${pageIndex}`;
      const cachedClip = atlases.get(clip);
      const cached = cachedClip?.pages.get(pageIndex);
      if (cached) {
        cached.lastUsed = performance.now();
        return Promise.resolve(cachedClip);
      }
      const pending = pendingAtlases.get(cacheKey);
      if (pending) {
        if (purpose === "demand") pending.demand = true;
        return pending.promise;
      }
      const definition = manifestValue?.clips[clip];
      if (!definition) return Promise.reject(new Error(`Missing Niumpi clip: ${clip}`));
      const pages = "pages" in definition.atlas ? definition.atlas.pages : [definition.atlas];
      const page = pages[pageIndex];
      if (!page) return Promise.reject(new Error(`Missing Niumpi ${clip} atlas page ${pageIndex}`));
      const assetSrc = resolveAtlasUrl(page.src, variant);
      // A deploy race can leave a browser-level negative cache for a hashed
      // page. The single controlled recovery uses one stable query suffix to
      // bypass that stale 404 without creating an unbounded family of URLs.
      const resolvedSrc = recoveryRef.current.attempts > 0
        ? `${assetSrc}${assetSrc.includes("?") ? "&" : "?"}niumpi-recovery=1`
        : assetSrc;
      const decodedBytes = decodedBytesForAtlasPage(page);
      const localDecodedBytes = [...atlases.values()].reduce((total, entry) => (
        total + [...entry.pages.values()].reduce((pageTotal, loadedPage) => pageTotal + loadedPage.bytes, 0)
      ), 0);
      if (purpose === "prefetch" && localDecodedBytes + decodedBytes > MAX_LOCAL_DECODED_BYTES) {
        canvas.dataset.prefetchSkipped = `${clip}:${pageIndex}:budget`;
        return Promise.resolve(cachedClip ?? { pages: new Map<number, LoadedAtlasPage>() });
      }
      ownedAtlasSources.add(resolvedSrc);
      const pendingEntry: PendingClipAtlas = { promise: Promise.resolve({ pages: new Map() }), demand: purpose === "demand" };
      const request = loadSpriteAtlas(resolvedSrc, decodedBytes).then((image) => {
        if (image.naturalWidth !== page.width || image.naturalHeight !== page.height) {
          ownedAtlasSources.delete(resolvedSrc);
          releaseSpriteAtlas(resolvedSrc);
          throw new Error(`Niumpi ${clip} atlas dimensions do not match its manifest`);
        }
        const loaded = atlases.get(clip) ?? { pages: new Map<number, LoadedAtlasPage>() };
        if (!disposed) {
          loaded.pages.set(pageIndex, {
            image,
            src: resolvedSrc,
            bytes: decodedBytes,
            lastUsed: performance.now(),
          });
          atlases.set(clip, loaded);
          // Demand pages replace the prior page when both cannot fit. Warm and
          // look-ahead pages are disposable optimisations and never evict the
          // frame currently on screen just to exceed the 96 MiB mobile cap.
          pruneDecodedPages(new Set([pendingEntry.demand ? cacheKey : activePageKey]));
        }
          pendingAtlases.delete(cacheKey);
          return loaded;
        })
        .catch((error) => {
          pendingAtlases.delete(cacheKey);
          if (ownedAtlasSources.delete(resolvedSrc)) releaseSpriteAtlas(resolvedSrc);
          throw error;
        });
      pendingEntry.promise = request;
      pendingAtlases.set(cacheKey, pendingEntry);
      return request;
    };

    const requestClip = (
      clip: NiumpiSpriteClip,
      source: "ambient" | "gameplay" | "lab",
      restart = false,
      generation?: number,
      controllerSource?: SpriteControllerSource,
    ) => {
      if (disposed || !machine || (generation != null && !intentGate.isCurrent(generation))) return;
      const needsAtlas = !atlases.get(clip)?.pages.has(0);
      // Commit the intent before decode. Starting it in atlasFor().then() with
      // the controller's old enteredAt can make a slow decode begin already
      // expired. If it becomes active, suspend in the same task so its clock
      // cannot move before the first page arrives; queued clips only prefetch.
      const forceWake = source !== "ambient" && machine.snapshot().clip === "sleep" && clip !== "sleep";
      const requestAt = controllerSource?.enteredAt ?? performance.now();
      const synchronizeReducedIdle = reducedMotion && source === "gameplay"
        && clip === "idle" && controllerSource?.anim === "idle" && protectedSuspendedToken === null;
      const beforeRequest = machine.snapshot();
      const result = synchronizeReducedIdle
        ? { accepted: true, queued: false, snapshot: machine.synchronize("idle", requestAt) }
        : machine.request(clip, requestAt, source, restart, forceWake);
      const afterRequest = machine.snapshot();
      if (clip === "idle" && isSemanticSpriteClip(beforeRequest.clip)
        && afterRequest.token !== beforeRequest.token) {
        pendingCompletedSnapshot = beforeRequest;
      }
      if ((result.accepted && !result.queued) || machine.snapshot().clip === clip) {
        sourceIntent = {
          clip,
          token: controllerSource?.token ?? "lab",
          anim: controllerSource?.anim ?? clip,
          phase: controllerSource?.phase ?? "action",
          enteredAt: requestAt,
          phaseStartedAt: controllerSource?.phaseStartedAt ?? requestAt,
          phaseEndsAt: controllerSource?.phaseEndsAt ?? null,
        };
      }
      const waitsForActiveAtlas = needsAtlas && machine.snapshot().clip === clip;
      if (waitsForActiveAtlas) suspend("atlas");
      void atlasFor(clip, 0, waitsForActiveAtlas ? "demand" : "prefetch").then(() => {
        if (!disposed && waitsForActiveAtlas) resume("atlas");
      }).catch((error) => {
        if (!disposed && waitsForActiveAtlas) resume("atlas");
        fail(error);
      });
    };

    const requestFromRoot = () => {
      if (!root || controlsRef.current.forcedClip || entrance || !machine) return;
      if (suspension.active) {
        deferredRootIntent = true;
        canvas.dataset.deferredRootIntent = root.dataset.motionToken ?? root.dataset.anim ?? "pending";
        return;
      }
      const intent = spriteIntentForRigRoot(root);
      if (!manifestValue) return;
      const resolved = resolveManifestClip(manifestValue, intent.clip);
      if (resolved.missingSemanticClip) canvas.dataset.missingSemanticClip = resolved.missingSemanticClip;
      else delete canvas.dataset.missingSemanticClip;
      if (root.classList.contains("is-target")) {
        void atlasFor("eat", 0, "prefetch").catch(fail);
      }
      const currentPhase = root.dataset.phase ?? "action";
      const intentKey = intent.clip === "sleep" ? `${intent.key}:${currentPhase}` : intent.key;
      const generation = intentGate.begin(intentKey);
      if (generation == null) return;
      const rawControllerSource = controllerSourceFromRoot();
      const deferredOffset = deferredIntentStartFloor !== null && intent.clip !== "idle"
        ? Math.max(0, deferredIntentStartFloor - rawControllerSource.enteredAt)
        : 0;
      const controllerSource: SpriteControllerSource = deferredOffset > 0 ? {
        ...rawControllerSource,
        enteredAt: rawControllerSource.enteredAt + deferredOffset,
        phaseStartedAt: rawControllerSource.phaseStartedAt + deferredOffset,
        phaseEndsAt: rawControllerSource.phaseEndsAt === null
          ? null
          : rawControllerSource.phaseEndsAt + deferredOffset,
      } : rawControllerSource;
      canvas.dataset.motionIntent = intentKey;
      canvas.dataset.intentGeneration = String(generation);
      if (intent.clip === "sleep" && currentPhase === "recovery" && machine.snapshot().clip === "sleep") {
        const wake = machine.request("idle", controllerSource.phaseStartedAt, "gameplay", false, true);
        sourceIntent = { clip: "sleep", ...controllerSource };
        canvas.dataset.sequenceToken = String(wake.snapshot.sequenceToken);
        return;
      }
      if (intent.favoriteFeed) {
        const needsEatAtlas = !atlases.get("eat")?.pages.has(0);
        const sequence = machine.requestSequence(
          ["eat", "happy"],
          controllerSource.enteredAt,
          "gameplay",
          false,
          machine.snapshot().clip === "sleep",
        );
        canvas.dataset.sequenceToken = String(sequence.snapshot.sequenceToken);
        if (sequence.accepted && !sequence.queued) sourceIntent = { clip: "eat", ...controllerSource };
        const waitsForEatAtlas = needsEatAtlas && machine.snapshot().clip === "eat";
        if (waitsForEatAtlas) suspend("atlas");
        void atlasFor("eat", 0, waitsForEatAtlas ? "demand" : "prefetch").then(() => {
          if (!disposed && waitsForEatAtlas) resume("atlas");
        }).catch((error) => {
          if (!disposed && waitsForEatAtlas) resume("atlas");
          fail(error);
        });
        // Preload is only an optimisation. The machine already owns the
        // durable sequence; a missing happy page will suspend at transition.
        void atlasFor("happy", 0, "prefetch").catch(fail);
      } else {
        requestClip(resolved.clip, "gameplay", resolved.clip === machine.snapshot().clip, generation, controllerSource);
      }
    };

    const schedule = () => {
      if (!disposed && !suspension.active && frameRequest === 0) frameRequest = window.requestAnimationFrame(draw);
    };

    const suspend = (reason: "viewport" | "document" | "atlas") => {
      const suspendAt = performance.now();
      const wasActive = suspension.active;
      if (!suspension.suspend(reason, suspendAt, lastPlaying)) return;
      canvas.dataset.suspendedBy = suspension.activeReasons().join(",");
      if (!wasActive) suspendedRootMotionToken = root?.dataset.motionToken ?? null;
      if (frameRequest) {
        window.cancelAnimationFrame(frameRequest);
        frameRequest = 0;
      }
    };

    const resume = (reason: "viewport" | "document" | "atlas") => {
      const resumeAt = performance.now();
      const resumed = suspension.resume(reason, resumeAt);
      canvas.dataset.suspendedBy = suspension.activeReasons().join(",");
      if (!resumed.removed || !resumed.fullyResumed) return;
      const resumedSameRootBehavior = suspendedRootMotionToken !== null
        && root?.dataset.motionToken === suspendedRootMotionToken;
      const activeBeforeResume = machine?.snapshot() ?? null;
      const sharedShiftMs = activeBeforeResume
        ? spriteClockShiftOnResume(
          resumed.shiftMs,
          resumeAt,
          activeBeforeResume.enteredAt,
          activeBeforeResume.token,
          lastToken,
        )
        : resumed.shiftMs;
      if (sharedShiftMs > 0 && machine) {
        machine.shiftClock(sharedShiftMs);
        nextAmbientAt += sharedShiftMs;
      }
      if (root && !controlsRef.current.forcedClip) {
        canvas.dispatchEvent(new CustomEvent(NIUMPI_SPRITE_CLOCK_RESUME_EVENT, {
          bubbles: true,
          detail: { shiftMs: sharedShiftMs, motionToken: suspendedRootMotionToken },
        }));
      }
      suspendedRootMotionToken = null;
      if (machine && machine.snapshot().clip !== "idle") {
        protectedSuspendedToken = resumedSameRootBehavior ? null : machine.snapshot().token;
        if (protectedSuspendedToken === null) delete canvas.dataset.protectedSuspendedToken;
        else canvas.dataset.protectedSuspendedToken = String(protectedSuspendedToken);
        if (sourceIntent?.clip === machine.snapshot().clip && sharedShiftMs > 0) {
          sourceIntent = {
            ...sourceIntent,
            enteredAt: sourceIntent.enteredAt + sharedShiftMs,
            phaseStartedAt: sourceIntent.phaseStartedAt + sharedShiftMs,
            phaseEndsAt: sourceIntent.phaseEndsAt === null ? null : sourceIntent.phaseEndsAt + sharedShiftMs,
          };
        }
      }
      if (deferredRootIntent) {
        deferredRootIntent = false;
        delete canvas.dataset.deferredRootIntent;
        deferredIntentStartFloor = resumeAt;
        requestFromRoot();
        deferredIntentStartFloor = null;
      }
      schedule();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) suspend("document");
      else resume("document");
    };

    const draw = (now: number) => {
      frameRequest = 0;
      if (disposed || suspension.active || !manifestValue || !machine) return;
      const controls = controlsRef.current;

      if (controls.forcedClip !== lastForced) {
        lastForced = controls.forcedClip;
        if (lastForced) requestClip(lastForced, "lab", true);
      }
      if (controls.playing !== lastPlaying) {
        lastPlaying = controls.playing !== false;
        if (!lastPlaying) pausedAt = now;
        else if (pausedAt) {
          machine.shiftClock(now - pausedAt);
          pausedAt = 0;
        }
      }

      const clockNow = lastPlaying ? now : pausedAt || now;
      if (controls.restartToken !== lastRestartToken) {
        lastRestartToken = controls.restartToken ?? 0;
        machine.restart(clockNow);
        firedEvents.clear();
      }
      const beforeAdvance = machine.snapshot();
      let snapshot = controls.forcedClip ? beforeAdvance : machine.advance(clockNow);
      let completedSnapshot: SpriteMachineSnapshot | null = pendingCompletedSnapshot;
      pendingCompletedSnapshot = null;
      completedSnapshot ??= !controls.forcedClip
        && snapshot.token !== beforeAdvance.token
        ? beforeAdvance
        : null;
      if (protectedSuspendedToken !== null && snapshot.token !== protectedSuspendedToken) {
        protectedSuspendedToken = null;
        delete canvas.dataset.protectedSuspendedToken;
      }
      if (controls.forcedClip && snapshot.clip !== controls.forcedClip && atlases.has(controls.forcedClip)) {
        machine.request(controls.forcedClip, clockNow, "lab", true);
        snapshot = machine.snapshot();
      }
      if (!controls.forcedClip && root && manifestValue) {
        const liveSource = controllerSourceFromRoot();
        const liveIntent = resolveManifestClip(manifestValue, spriteIntentForRigRoot(root).clip).clip;
        if (protectedSuspendedToken === snapshot.token && liveIntent === snapshot.clip
          && sourceIntent?.token === liveSource.token) {
          protectedSuspendedToken = null;
          delete canvas.dataset.protectedSuspendedToken;
        }
        const preservesSuspendedOneShot = protectedSuspendedToken === snapshot.token;
        if (liveIntent === "idle" && isSemanticSpriteClip(snapshot.clip)
          && sourceIntent?.token !== liveSource.token && !preservesSuspendedOneShot) {
          const beforeSynchronization = snapshot;
          snapshot = machine.synchronize("idle", liveSource.enteredAt);
          if (snapshot.token !== beforeSynchronization.token) completedSnapshot ??= beforeSynchronization;
        }
        if (snapshot.clip === liveIntent && sourceIntent?.token !== root.dataset.motionToken) {
          sourceIntent = { clip: snapshot.clip, ...liveSource };
        }
      }

      if (!reducedMotion && !controls.forcedClip && snapshot.state === "IDLE" && rigAllowsAmbient(root) && clockNow >= nextAmbientAt) {
        const roll = Math.random();
        const ambient: NiumpiSpriteClip = roll < 0.6 ? "blink" : roll < 0.8 ? "look_left" : "look_right";
        requestClip(ambient, "ambient");
        nextAmbientAt = clockNow + nextAmbientDelay();
      }

      const clip = manifestValue.clips[snapshot.clip] ?? manifestValue.clips.idle;
      const explicitFrame = controls.frameOverride;
      if (explicitFrame != null && explicitFrame !== lastFrameOverride) {
        machine.seek(clockNow, elapsedAtFrame(clip, explicitFrame));
        snapshot = machine.snapshot();
      }
      lastFrameOverride = explicitFrame ?? null;
      const shouldLoop = controls.loopOverride ?? clip.loop;
      const elapsed = explicitFrame == null
        ? Math.max(0, clockNow - snapshot.enteredAt)
        : elapsedAtFrame(clip, explicitFrame);
      const exitElapsed = snapshot.exitStartedAt === null ? null : Math.max(0, clockNow - snapshot.exitStartedAt);
      const liveRootSource = root && !controls.forcedClip ? controllerSourceFromRoot() : null;
      const liveRootClip = root && manifestValue && !controls.forcedClip
        ? resolveManifestClip(manifestValue, spriteIntentForRigRoot(root).clip).clip
        : null;
      const rootSource = resolveSpriteControllerSource(
        snapshot.clip,
        liveRootClip,
        liveRootSource,
        sourceIntent,
      );
      const sourceMatches = rootSource !== null;
      const usesLiveController = liveRootSource !== null && liveRootClip === snapshot.clip;
      const sourcePhase = sourceMatches ? rootSource?.phase ?? "none" : "none";
      const sourcePhaseProgress = sourceMatches && rootSource
        ? rootSource.phaseEndsAt === null
          ? 1
          : Math.max(0, Math.min(1, (clockNow - rootSource.phaseStartedAt) / Math.max(1, rootSource.phaseEndsAt - rootSource.phaseStartedAt)))
        : 0;
      canvas.dataset.sourceMotionToken = sourceMatches ? rootSource?.token ?? "none" : "none";
      canvas.dataset.sourceAnim = sourceMatches ? rootSource?.anim ?? "none" : "none";
      canvas.dataset.sourcePhase = sourcePhase;
      canvas.dataset.sourceEnteredAt = sourceMatches ? String(rootSource?.enteredAt ?? "none") : "none";
      canvas.dataset.sourcePhaseStartedAt = sourceMatches ? String(rootSource?.phaseStartedAt ?? "none") : "none";
      canvas.dataset.sourcePhaseEndsAt = sourceMatches ? String(rootSource?.phaseEndsAt ?? "none") : "none";
      const frame = explicitFrame == null
        ? reducedMotion
          ? sourceMatches && ["anticipation", "action", "recovery"].includes(sourcePhase)
            ? reducedFrameIndexAtControllerPhase(clip, sourcePhase as SpritePhase, sourcePhaseProgress)
            : reducedFrameIndexAtElapsed(clip, elapsed, exitElapsed)
          : usesLiveController && isSemanticSpriteClip(snapshot.clip)
            && ["anticipation", "action", "recovery"].includes(sourcePhase)
            ? clip.playback?.loopRange && sourcePhase === "action"
              ? Math.max(
                clip.playback.loopRange.startFrame,
                frameIndexAtElapsed(clip, elapsed, controls.forcedClip ? shouldLoop : clip.loop, exitElapsed),
              )
              : frameIndexAtControllerPhase(clip, sourcePhase as SpritePhase, sourcePhaseProgress)
            : frameIndexAtElapsed(clip, elapsed, controls.forcedClip ? shouldLoop : clip.loop, exitElapsed)
        : Math.max(0, Math.min(clip.frames.length - 1, Math.round(explicitFrame)));
      const requiredPage = clip.frames[frame]?.page ?? 0;
      const atlas = atlases.get(snapshot.clip);
      if (!atlas?.pages.has(requiredPage)) {
        suspend("atlas");
        void atlasFor(snapshot.clip, requiredPage)
          .then(() => resume("atlas"))
          .catch((error) => { resume("atlas"); fail(error); });
        return;
      }

      if (frame !== lastFrame || snapshot.token !== lastToken) {
        const source = clip.frames[frame];
        const atlasPage = atlas.pages.get(source.page ?? 0);
        if (!atlasPage) {
          fail(new Error(`Missing atlas page ${source.page ?? 0} for ${snapshot.clip}`));
          return;
        }
        context.clearRect(0, 0, canvas.width, canvas.height);
        activePageKey = `${snapshot.clip}:${source.page ?? 0}`;
        atlasPage.lastUsed = now;
        pruneDecodedPages(new Set([activePageKey]));
        const destination = spriteFrameDestinationRect(manifestValue, source, canvas.width, canvas.height);
        context.drawImage(
          atlasPage.image,
          source.x,
          source.y,
          source.w,
          source.h,
          destination.x,
          destination.y,
          destination.width,
          destination.height,
        );
        const preloadFrame = clip.frames[Math.min(clip.frames.length - 1, frame + 10)];
        if ((preloadFrame.page ?? 0) !== (source.page ?? 0)) {
          void atlasFor(snapshot.clip, preloadFrame.page ?? 0, "prefetch").catch(fail);
        }
        if (!clip.loop && frame >= clip.frameCount - 10 && snapshot.clip !== "idle") {
          void atlasFor("idle", 0, "prefetch").catch(fail);
        }
        const food = snapshot.clip === "eat"
          ? foodPropStateAtFrame(clip, frame, root?.dataset.actionProp ?? "moonberry")
          : null;
        if (food) drawFoodProp(context, canvas.width, canvas.height, food);
        canvas.dataset.renderer = `sprite-atlas-v${manifestValue.schemaVersion}`;
        canvas.dataset.clip = snapshot.clip;
        canvas.dataset.state = snapshot.state;
        canvas.dataset.frame = String(frame);
        canvas.dataset.phase = spritePhaseAtFrame(clip, frame);
        canvas.dataset.totalFrames = String(clip.frameCount);
        canvas.dataset.fps = String(clip.fps);
        canvas.dataset.loop = String(shouldLoop);
        canvas.dataset.foodProp = food?.active ? food.id : "none";
        canvas.dataset.foodBites = String(food?.bites ?? 0);
        canvas.dataset.atlasSrc = atlasPage.src;
        canvas.dataset.atlasPage = String(source.page ?? 0);
        canvas.dataset.atlasRect = `${source.x},${source.y},${source.w},${source.h}`;
        canvas.dataset.reducedPoseFrame = clip.playback ? String(clip.playback.reducedPoseFrame) : "none";
        const motionGate = motionGateForClip(snapshot.clip, clip);
        canvas.dataset.motionGate = motionGate;
        if (completedSnapshot) {
          const completedClip = manifestValue.clips[completedSnapshot.clip] ?? manifestValue.clips.idle;
          canvas.dataset.spriteToken = String(completedSnapshot.token);
          if (eventToken !== completedSnapshot.token) {
            const cleanup = presentationEvents.interrupt(lastFrame);
            if (cleanup) emitPresentationEvent(cleanup, true, cleanup.spriteToken);
            const preservesPersistentEvents = preservesSpritePresentationEventWindow(
              eventClip,
              completedSnapshot.clip,
              completedClip,
              completedSnapshot.exitStartedAt !== null,
            );
            eventToken = completedSnapshot.token;
            eventClip = completedSnapshot.clip;
            resetPresentation(completedSnapshot.token);
            if (!preservesPersistentEvents) firedEvents.clear();
          }
          emitEventsThrough(
            completedClip,
            completedClip.frameCount - 1,
            completedSnapshot.token,
            { exitActive: completedSnapshot.exitStartedAt !== null, terminal: true },
          );
        }
        canvas.dataset.spriteToken = String(snapshot.token);
        controls.onFrame?.({ ...snapshot, frame, totalFrames: clip.frameCount, fps: clip.fps, playing: lastPlaying, loop: shouldLoop, motionGate });
        if (snapshot.token !== eventToken) {
          const cleanup = presentationEvents.interrupt(frame);
          if (cleanup) emitPresentationEvent(cleanup, true, cleanup.spriteToken);
          const preservesPersistentEvents = preservesSpritePresentationEventWindow(
            eventClip,
            snapshot.clip,
            clip,
            snapshot.exitStartedAt !== null,
          );
          eventToken = snapshot.token;
          eventClip = snapshot.clip;
          resetPresentation(snapshot.token);
          if (!preservesPersistentEvents) firedEvents.clear();
        }
        emitEventsThrough(clip, frame, snapshot.token, { exitActive: snapshot.exitStartedAt !== null });
        lastFrame = frame;
        lastToken = snapshot.token;
      }
      schedule();
    };

    const start = async () => {
      try {
        const forceReload = recoveryRef.current.attempts > 0
          && recoveryRef.current.reloadedToken !== assetReloadToken;
        if (forceReload) {
          recoveryRef.current.reloadedToken = assetReloadToken;
          recoveryRef.current.pending = false;
        }
        const loaded = forceReload
          ? await reloadSpriteManifest(variant, recoveryRef.current.staleManifest)
          : await loadSpriteManifest(variant);
        if (disposed) return;
        if (forceReload) {
          const stale = recoveryRef.current.staleManifest;
          const advancedGeneration = spriteRecoveryAdvancesGeneration(stale, loaded);
          recoveryRef.current.pending = false;
          if (advancedGeneration) {
            recoveryRef.current.attempts = 0;
            recoveryRef.current.terminal = false;
            recoveryRef.current.staleManifest = null;
            canvas.dataset.assetRecoveryAttempts = "0";
            canvas.dataset.assetRecoveryGeneration = "advanced";
          } else {
            canvas.dataset.assetRecoveryGeneration = "same";
          }
        }
        manifestValue = loaded;
        setManifest(loaded);
        canvas.dataset.schemaVersion = String(loaded.schemaVersion);
        const initial = controlsRef.current.forcedClip ?? (entrance ? "hatch_complete" : "idle");
        await atlasFor(initial);
        if (disposed) return;
        // Loading time is not animation time. Start frame zero only after the
        // required atlas is decoded, otherwise a slow phone could skip hatch.
        machine = new NiumpiSpriteMachine(loaded, initial, performance.now());
        const initialSource = controllerSourceFromRoot();
        sourceIntent = {
          clip: initial,
          token: controlsRef.current.forcedClip ? "lab" : initialSource.token,
          anim: controlsRef.current.forcedClip ?? initialSource.anim,
          phase: controlsRef.current.forcedClip ? "action" : initialSource.phase,
          enteredAt: controlsRef.current.forcedClip ? performance.now() : initialSource.enteredAt,
          phaseStartedAt: controlsRef.current.forcedClip ? performance.now() : initialSource.phaseStartedAt,
          phaseEndsAt: controlsRef.current.forcedClip ? null : initialSource.phaseEndsAt,
        };
        resize();
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
        if (root && !controlsRef.current.forcedClip && !entrance) {
          observer = new MutationObserver(requestFromRoot);
          observer.observe(root, {
            attributes: true,
            attributeFilter: [
              "data-anim", "data-phase", "data-motion-token", "data-motion-entered-at",
              "data-phase-started-at", "data-phase-ends-at", "class",
            ],
          });
          requestFromRoot();
        }
        intersectionObserver = new IntersectionObserver(([entry]) => {
          if (entry.isIntersecting) resume("viewport");
          else suspend("viewport");
        }, { rootMargin: "120px" });
        intersectionObserver.observe(canvas);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        handleVisibilityChange();
        // Paint the first decoded frame before hiding the fallback. This keeps
        // clip changes and the hatch entrance free of transparent flashes.
        draw(performance.now());
        setReady(true);
        canvas.dataset.assetRecovery = forceReload ? "recovered" : "none";
        // Warm the direct interaction clips after first paint without delaying
        // the visible idle pose or loading unrelated evolution variants.
        if (canWarmInteractionAtlas()) {
          const warm = () => { void atlasFor("tap_reaction", 0, "prefetch").catch(() => undefined); };
          warmTimer = window.setTimeout(warm, 300);
        }
      } catch (error) {
        fail(error);
      }
    };

    void start();
    return () => {
      disposed = true;
      observer?.disconnect();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (frameRequest) window.cancelAnimationFrame(frameRequest);
      if (warmTimer) window.clearTimeout(warmTimer);
      if (recoveryTimer) window.clearTimeout(recoveryTimer);
      const cleanup = presentationEvents.interrupt(lastFrame);
      if (cleanup) emitPresentationEvent(cleanup, true, cleanup.spriteToken);
      for (const src of ownedAtlasSources) releaseSpriteAtlas(src);
      ownedAtlasSources.clear();
      atlases.clear();
      frameRequest = 0;
      canvas.dataset.loopStopped = "true";
    };
  // Playback controls are intentionally read through controlsRef; adding them
  // here would tear down the Canvas machine whenever the Lab steps a frame.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetReloadToken, entrance, reducedMotion, variant]);

  const anchorStyle = manifest ? {
    left: `${(manifest.anchor.x / manifest.canvas.width) * 100}%`,
    top: `${(manifest.anchor.y / manifest.canvas.height) * 100}%`,
  } : undefined;

  return (
    <span
      className={`nb-frame-player ${ready ? "is-ready" : "is-loading"} ${failed ? "is-error" : ""} ${reducedMotion ? "is-reduced" : ""}`}
      data-variant={variant}
      data-schema-version={manifest?.schemaVersion ?? "loading"}
    >
      <Image className="nb-frame-fallback" src={fallback} alt="" fill sizes="330px" unoptimized draggable={false} />
      <canvas ref={canvasRef} className="nb-frame-canvas" width={512} height={512} aria-hidden="true" />
      <span
        ref={presentationRef}
        className="nb-presentation-layer"
        data-presentation-prop="none"
        data-presentation-effect="none"
        data-presentation-event="none"
        aria-hidden="true"
      >
        <span className="nb-presentation-prop nb-presentation-book"><Art name="book" size="100%" /></span>
        <span className="nb-presentation-prop nb-presentation-blanket"><Art name="cushion" size="100%" /></span>
        <span className="nb-presentation-effect nb-presentation-glow"><Art name="spark" size="100%" /></span>
        <span className="nb-presentation-effect nb-presentation-note"><Art name="note" size="100%" /></span>
        <span className="nb-presentation-effect nb-presentation-dream"><Art name="sleep" size="100%" /></span>
        <span className="nb-presentation-effect nb-presentation-travel"><Art name="cloud" size="100%" /></span>
        <span className="nb-presentation-effect nb-presentation-sigh">· · ·</span>
      </span>
      {showAnchor && manifest && <span className="nb-frame-anchor" style={anchorStyle} aria-hidden="true" />}
    </span>
  );
}
