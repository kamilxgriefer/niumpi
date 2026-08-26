import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  clearSpriteAssetCacheForTests,
  invalidateSpriteVariant,
  loadSpriteAtlas,
  loadSpriteManifest,
  MAX_GLOBAL_ATLAS_DECODED_BYTES,
  reloadSpriteManifest,
  spriteRecoveryAdvancesGeneration,
  releaseSpriteAtlas,
  spriteAtlasCacheStatsForTests,
  spriteManifestUrl,
} from "../app/anim/NiumpiSpriteAssets.ts";
import { foodPropStateAtFrame } from "../app/anim/NiumpiFoodProp.ts";
import {
  fallbackForVariant,
  isAvailableModelVariant,
  NIUMPI_AVAILABLE_MODEL_VARIANTS,
  NIUMPI_SUPPORTED_MODEL_VARIANTS,
  variantFor,
} from "../app/anim/NiumpiModelVariants.ts";
import {
  clipForRigRoot,
  decodedBytesForAtlasPage,
  elapsedAtFrame,
  frameIndexAtControllerPhase,
  frameIndexAtElapsed,
  manifestSpriteClips,
  NIUMPI_SEMANTIC_SPRITE_CLIPS,
  NiumpiSpriteMachine,
  preservesSpritePresentationEventWindow,
  motionGateForClip,
  reducedEventsForClip,
  reducedFrameIndexAtElapsed,
  reducedFrameIndexAtControllerPhase,
  resolveManifestClip,
  resolveSpriteControllerSource,
  rigAllowsAmbient,
  SEMANTIC_CLIP_CONTRACT,
  spritePhaseAtFrame,
  SpritePresentationEventLedger,
  SpritePlaybackSuspension,
  spriteClipsForVariant,
  spriteFrameDestinationRect,
  spriteClockShiftOnResume,
  spritePresentationEventsForStep,
  SpriteIntentGate,
  spriteIntentForRigRoot,
  validateSpriteManifest,
  type NiumpiSpriteClip,
  type NiumpiSpriteManifest,
  type SpriteClip,
  type SpriteClipCatalog,
} from "../app/anim/NiumpiSpriteRuntime.ts";
import {
  friendAvatarIsAnimated,
  MAX_LIVE_FRIEND_AVATARS,
} from "../app/ui/niumpi/NiumpiAvatarBudget.ts";

function clip(name: NiumpiSpriteClip, frameCount: number, loop: boolean): SpriteClip {
  const durationMs = 1000 / 24;
  return {
    name,
    fps: 24,
    frameCount,
    durationMs: frameCount * durationMs,
    loop,
    transition: { anticipationFrames: 1, actionFrames: Math.max(1, frameCount - 2), recoveryFrames: 1 },
    atlas: { src: `atlases/${name}.webp`, width: 512 * frameCount, height: 512 },
    frames: Array.from({ length: frameCount }, (_, index) => ({
      index, x: index * 512, y: 0, w: 512, h: 512, anchorX: 256, anchorY: 466, durationMs,
    })),
    events: name === "eat" ? [
      { frame: 8, type: "bite", payload: { bite: 1 } },
      { frame: 16, type: "bite", payload: { bite: 2 } },
      { frame: 24, type: "bite", payload: { bite: 3 } },
      { frame: 32, type: "swallow" },
    ] : [],
    rigProof: {
      animatedControls: ["body", "head"],
      animatedChannels: ["body.scale", "head.rotation"],
      regions: name === "blink" ? ["eyes", "eyelids", "head"] : ["body", "head"],
      ...(name === "blink" ? { blinkClosure: 0.92 } : {}),
    },
  };
}

function fixture(): NiumpiSpriteManifest {
  const clips = Object.fromEntries(spriteClipsForVariant("baby").map((name) => [
    name,
    clip(name, name === "idle" ? 72 : name === "blink" ? 12 : 36, name === "idle"),
  ])) as SpriteClipCatalog;
  return {
    schemaVersion: 2,
    variant: "baby",
    fps: 24,
    canvas: { width: 512, height: 512 },
    anchor: { x: 256, y: 466 },
    clips,
    rigProof: { animatedControls: ["body", "head", "arm.L", "arm.R"], animatedChannels: ["location", "rotation", "scale"], regions: ["body", "head", "arms"] },
  };
}

function v3Fixture(): NiumpiSpriteManifest {
  const manifest = fixture();
  manifest.schemaVersion = 3;
  manifest.packing = {
    mode: "trimmed-rgba-v1",
    transparentRGB: "zero-when-alpha-zero",
    sourceCanonicalization: {
      transparentRGB: "zero-when-alpha-zero",
      stage: "pre-encode",
    },
    decodedTransparentRGB: "unspecified-for-lossy-webp",
    gutterPx: 4,
    maxDecodedPageBytes: 44_040_192,
  };
  for (const definition of Object.values(manifest.clips)) {
    if (!definition) continue;
    const pageWidth = 264;
    const pageHeight = 308;
    definition.atlas = {
      pages: definition.frames.map((_, index) => {
        const sha256 = (index + 1).toString(16).padStart(64, "0");
        return {
          src: `atlases/${definition.name}-${index}-${sha256.slice(0, 12)}.webp`,
          width: pageWidth,
          height: pageHeight,
          decodedBytes: pageWidth * pageHeight * 4,
          sha256,
        };
      }),
    };
    definition.frames = definition.frames.map((frame, index) => ({
      ...frame,
      page: index,
      x: 4,
      y: 4,
      w: 256,
      h: 300,
      offsetX: 128,
      offsetY: 96,
    }));
    definition.encoding = {
      format: "WebP",
      rgb: { lossy: true, quality: 86, foregroundMAE: 2.1, foregroundPSNR: 38.2 },
      alpha: { lossless: true, meanAbsoluteError: 0 },
      thresholds: { foregroundMAEMax: 2.5, foregroundPSNRMin: 38, alphaMAE: 0 },
      selection: {
        strategy: "lowest-passing-quality",
        claim: "first-passing-declared-candidate",
        candidateQualities: [85, 86, 100],
        selectedQuality: 86,
        predecessor: {
          quality: 85,
          passes: false,
          foregroundMAE: 2.6,
          foregroundPSNR: 37.9,
          alphaMAE: 0,
          failingFrames: [0],
        },
        evaluatedQualities: [85, 86],
        candidateProofs: [
          { quality: 85, passes: false, foregroundMAE: 2.6, foregroundPSNR: 37.9, alphaMAE: 0, failingFrames: [0] },
          { quality: 86, passes: true, foregroundMAE: 2.1, foregroundPSNR: 38.2, alphaMAE: 0, failingFrames: [] },
        ],
      },
      frameGate: {
        foregroundAlpha: ">0",
        allFramesPassed: true,
        frames: definition.frames.map((_, index) => ({
          index, passes: true, foregroundMAE: 2.1, foregroundPSNR: 38.2, alphaMAE: 0,
        })),
      },
    };
  }
  return manifest;
}

function semanticFixture(): NiumpiSpriteManifest {
  const manifest = fixture();
  for (const name of NIUMPI_SEMANTIC_SPRITE_CLIPS) {
    const contract = SEMANTIC_CLIP_CONTRACT[name];
    const definition = clip(name, contract.frameCount, name === "sleep");
    definition.transition = { ...contract.transition };
    definition.playback = {
      ...contract.playback,
      loopRange: contract.playback.loopRange ? { ...contract.playback.loopRange } : undefined,
      exitRange: contract.playback.exitRange ? { ...contract.playback.exitRange } : undefined,
      reducedPoseFrame: Math.min(contract.frameCount - 1, contract.transition.anticipationFrames + 2),
    };
    if (name === "read") definition.events = [
      { frame: 10, type: "prop_attach", payload: { prop: "book" } },
      { frame: 76, type: "prop_detach" },
    ];
    manifest.clips[name] = definition;
  }
  return manifest;
}

function fakeRoot({
  classes = [],
  anim = "idle",
  token = "1",
  prop,
  gazeTargetX,
  renderedGazeX = "0px",
}: {
  classes?: string[];
  anim?: string;
  token?: string;
  prop?: string;
  gazeTargetX?: number;
  renderedGazeX?: string;
} = {}) {
  const values = new Set(classes);
  return {
    dataset: {
      anim,
      motionToken: token,
      ...(prop ? { actionProp: prop } : {}),
      ...(gazeTargetX == null ? {} : { gazeTargetX: String(gazeTargetX) }),
    },
    classList: { contains: (name: string) => values.has(name) },
    style: { getPropertyValue: (name: string) => name === "--gaze-x" ? renderedGazeX : "" },
  } as unknown as HTMLElement;
}

test("saved growth and locked routes map to stable renderer variants", () => {
  assert.deepEqual(NIUMPI_SUPPORTED_MODEL_VARIANTS, [
    "baby", "stage-2", "stage-3", "stage-4", "stage-5",
    "moonveil", "bloomheart", "sparkleap", "mistwander", "prismatic",
  ]);
  assert.deepEqual(NIUMPI_AVAILABLE_MODEL_VARIANTS, NIUMPI_SUPPORTED_MODEL_VARIANTS, "the available catalog must match the ten validated production manifests");
  assert.equal(isAvailableModelVariant("baby"), true);
  assert.equal(isAvailableModelVariant("stage-2"), true);
  assert.equal(isAvailableModelVariant("stage-3"), true);
  assert.equal(variantFor(1, "seedling"), "baby");
  assert.equal(variantFor(2, "seedling"), "stage-2");
  assert.equal(variantFor(3, "moonveil", "moonveil"), "stage-3");
  assert.equal(variantFor(4, "moonveil", "moonveil"), "stage-4", "branch stage keeps its authored growth silhouette");
  assert.equal(variantFor(5, "seedling"), "stage-5");
  for (const route of ["moonveil", "bloomheart", "sparkleap", "mistwander", "prismatic"] as const) {
    assert.equal(variantFor(5, route, route), route);
  }
  assert.equal(variantFor(5, "sparkleap", "mistwander"), "mistwander", "the committed route outranks stale morphology");
});

test("manifest URLs and approved still fallbacks are variant-specific", () => {
  assert.equal(spriteManifestUrl("baby"), "/assets/niumpi/v2/baby/manifest.json");
  assert.equal(spriteManifestUrl("stage-4"), "/assets/niumpi/v2/stage-4/manifest.json");
  assert.equal(spriteManifestUrl("prismatic"), "/assets/niumpi/v2/prismatic/manifest.json");
  assert.equal(fallbackForVariant("baby"), "/assets/niumpi/stages/stage-1.webp");
  assert.equal(fallbackForVariant("stage-4"), "/assets/niumpi/stages/stage-4.webp");
  assert.equal(fallbackForVariant("moonveil"), "/assets/niumpi/forms/moonveil.webp");
});

test("manifest v2 validates fixed canvas, sequential frame rectangles and rig proof", () => {
  const manifest = validateSpriteManifest(fixture());
  assert.equal(manifest.variant, "baby");
  assert.equal(manifest.fps, 24);
  assert.deepEqual(Object.keys(manifest.clips), [...spriteClipsForVariant("baby")]);
  assert.deepEqual(manifestSpriteClips(manifest), [...spriteClipsForVariant("baby")]);
  assert.equal(manifest.anchor.y, 466);
});

test("manifest v3 validates trimmed crops, full hashes and exact decoded-byte accounting", () => {
  const manifest = validateSpriteManifest(v3Fixture());
  const frame = manifest.clips.idle.frames[0];
  const pages = "pages" in manifest.clips.idle.atlas ? manifest.clips.idle.atlas.pages : [];
  assert.equal(decodedBytesForAtlasPage(pages[0]), 264 * 308 * 4);
  assert.deepEqual(spriteFrameDestinationRect(manifest, frame, 1024, 1024), {
    x: 256,
    y: 192,
    width: 512,
    height: 600,
  });
});

test("manifest v3 codec evidence accepts first declared q79 and rejects forged proof", () => {
  const firstCandidate = v3Fixture();
  const firstEncoding = firstCandidate.clips.idle.encoding!;
  firstEncoding.rgb.quality = 79;
  firstEncoding.selection.candidateQualities = [79, 100];
  firstEncoding.selection.selectedQuality = 79;
  firstEncoding.selection.predecessor = null;
  firstEncoding.selection.evaluatedQualities = [79];
  firstEncoding.selection.candidateProofs = [{
    quality: 79,
    passes: true,
    foregroundMAE: firstEncoding.rgb.foregroundMAE,
    foregroundPSNR: firstEncoding.rgb.foregroundPSNR,
    alphaMAE: firstEncoding.alpha.meanAbsoluteError,
    failingFrames: [],
  }];
  assert.equal(validateSpriteManifest(firstCandidate).clips.idle.encoding?.rgb.quality, 79);

  const missingFrameGate = v3Fixture();
  (missingFrameGate.clips.idle.encoding as unknown as { frameGate?: unknown }).frameGate = undefined;
  assert.throws(() => validateSpriteManifest(missingFrameGate), /Invalid v3 atlas integrity in idle/);

  const weakenedThreshold = v3Fixture();
  weakenedThreshold.clips.idle.encoding!.thresholds.foregroundMAEMax = 999;
  assert.throws(() => validateSpriteManifest(weakenedThreshold), /Invalid v3 atlas integrity in idle/);

  const forgedFailedCandidate = v3Fixture();
  const forgedProof = forgedFailedCandidate.clips.idle.encoding!.selection.candidateProofs[0];
  forgedProof.foregroundMAE = 0;
  forgedProof.foregroundPSNR = null;
  assert.throws(() => validateSpriteManifest(forgedFailedCandidate), /Invalid v3 atlas integrity in idle/);

  const invalidFailureIndex = v3Fixture();
  invalidFailureIndex.clips.idle.encoding!.selection.candidateProofs[0].failingFrames = [999];
  assert.throws(() => validateSpriteManifest(invalidFailureIndex), /Invalid v3 atlas integrity in idle/);

  const lossless = v3Fixture();
  const losslessEncoding = lossless.clips.idle.encoding!;
  losslessEncoding.rgb = { lossy: false, quality: null, foregroundMAE: 0, foregroundPSNR: null };
  losslessEncoding.selection = {
    strategy: "lossless-fallback",
    claim: "declared-candidates-exhausted",
    candidateQualities: [100],
    selectedQuality: null,
    predecessor: {
      quality: 100, passes: false, foregroundMAE: 2.6,
      foregroundPSNR: 37.9, alphaMAE: 0, failingFrames: [0],
    },
    evaluatedQualities: [100],
    candidateProofs: [{
      quality: 100, passes: false, foregroundMAE: 2.6,
      foregroundPSNR: 37.9, alphaMAE: 0, failingFrames: [0],
    }],
  };
  losslessEncoding.frameGate.frames = losslessEncoding.frameGate.frames.map((frame) => ({
    ...frame, foregroundMAE: 0, foregroundPSNR: null,
  }));
  validateSpriteManifest(lossless);
  losslessEncoding.selection.predecessor!.foregroundMAE = 2.7;
  assert.throws(() => validateSpriteManifest(lossless), /Invalid v3 atlas integrity in idle/);

  const missingPackingScope = v3Fixture();
  (missingPackingScope.packing as unknown as { sourceCanonicalization?: unknown }).sourceCanonicalization = undefined;
  assert.throws(() => validateSpriteManifest(missingPackingScope), /Invalid Niumpi v3 packing contract/);
});

test("schema v2 draw geometry remains a full logical canvas", () => {
  const manifest = fixture();
  assert.deepEqual(spriteFrameDestinationRect(manifest, manifest.clips.idle.frames[0], 768, 384), {
    x: 0,
    y: 0,
    width: 768,
    height: 384,
  });
});

test("manifest v3 rejects destination/source overflow, decoded mismatch and forged hashes", () => {
  const destinationOverflow = v3Fixture();
  destinationOverflow.clips.idle.frames[0].offsetX = 300;
  assert.throws(() => validateSpriteManifest(destinationOverflow), /Unstable canvas or anchor in idle/);

  const sourceOverflow = v3Fixture();
  sourceOverflow.clips.idle.frames[0].x = 20;
  assert.throws(() => validateSpriteManifest(sourceOverflow), /Frame outside atlas in idle/);

  const decodedMismatch = v3Fixture();
  const decodedPages = "pages" in decodedMismatch.clips.idle.atlas
    ? decodedMismatch.clips.idle.atlas.pages : [];
  decodedPages[0].decodedBytes = 1;
  assert.throws(() => validateSpriteManifest(decodedMismatch), /Invalid v3 atlas integrity in idle/);

  const forgedHash = v3Fixture();
  const forgedPages = "pages" in forgedHash.clips.idle.atlas ? forgedHash.clips.idle.atlas.pages : [];
  forgedPages[0].sha256 = "f".repeat(64);
  assert.throws(() => validateSpriteManifest(forgedHash), /Invalid v3 atlas integrity in idle/);
});

test("recovery allowance resets only when a successful manifest advances generation", () => {
  const stale = v3Fixture();
  const unchanged = structuredClone(stale);
  const advanced = structuredClone(stale);
  const pages = "pages" in advanced.clips.idle.atlas ? advanced.clips.idle.atlas.pages : [];
  pages[0].sha256 = "a".repeat(64);
  pages[0].src = `atlases/idle-0-${pages[0].sha256.slice(0, 12)}.webp`;
  assert.equal(spriteRecoveryAdvancesGeneration(stale, unchanged), false,
    "the same failing generation must stay terminal after its one recovery");
  assert.equal(spriteRecoveryAdvancesGeneration(stale, advanced), true,
    "a new content fingerprint earns its own single controlled recovery");
  assert.equal(spriteRecoveryAdvancesGeneration(null, advanced), true,
    "a manifest that appears after an initial 404 establishes a new generation");
});

test("semantic manifests are validated against the shared 24 FPS motion contract", () => {
  const manifest = validateSpriteManifest(semanticFixture());
  assert.deepEqual(manifestSpriteClips(manifest), [
    ...spriteClipsForVariant("baby"),
    ...NIUMPI_SEMANTIC_SPRITE_CLIPS,
  ]);
  assert.equal(manifest.clips.sleep?.loop, true);
  assert.deepEqual(manifest.clips.sleep?.playback?.loopRange, { startFrame: 16, endFrameExclusive: 96 });
  const broken = semanticFixture();
  if (broken.clips.sleep) broken.clips.sleep.playback = undefined;
  assert.throws(() => validateSpriteManifest(broken), /Invalid semantic playback in sleep/);
});

test("missing semantic clips fall back honestly while manifest-present clips remain selectable", () => {
  const core = fixture();
  assert.deepEqual(resolveManifestClip(core, "read"), { clip: "idle", missingSemanticClip: "read" });
  assert.deepEqual(resolveManifestClip(core, "tap_reaction"), { clip: "tap_reaction", missingSemanticClip: null });
  const complete = semanticFixture();
  assert.deepEqual(resolveManifestClip(complete, "read"), { clip: "read", missingSemanticClip: null });
});

test("paged atlases keep every frame on a safe 4096px page", () => {
  const paged = fixture();
  const idle = paged.clips.idle;
  idle.atlas = {
    pages: [
      { src: "atlases/idle-0.webp", width: 4096, height: 4096 },
      { src: "atlases/idle-1.webp", width: 4096, height: 4096 },
    ],
  };
  idle.frames = idle.frames.map((frame, index) => {
    const local = index % 64;
    return { ...frame, page: Math.floor(index / 64), x: (local % 8) * 512, y: Math.floor(local / 8) * 512 };
  });
  assert.equal(validateSpriteManifest(paged).clips.idle.frames[71].page, 1);
  (idle.atlas as { pages: Array<{ src: string; width: number; height: number }> }).pages[0].width = 4608;
  assert.throws(() => validateSpriteManifest(paged), /Invalid atlas pages in idle/);
});

test("elapsed-time stepping is independent of display refresh rate", () => {
  const idle = fixture().clips.idle;
  assert.equal(frameIndexAtElapsed(idle, 0), 0);
  assert.equal(frameIndexAtElapsed(idle, 1000 / 24 - 0.1), 0);
  assert.equal(frameIndexAtElapsed(idle, 1000 / 24 + 0.1), 1);
  assert.equal(frameIndexAtElapsed(idle, 1000), 24);
  assert.equal(frameIndexAtElapsed(idle, idle.durationMs + 1000 / 24 + 0.1), 1);
  assert.ok(Math.abs(elapsedAtFrame(idle, 24) - 1000) < 0.001);
});

test("sprite phases use exact manifest frame boundaries", () => {
  const travel = semanticFixture().clips.travel!;
  assert.equal(spritePhaseAtFrame(travel, 0), "anticipation");
  assert.equal(spritePhaseAtFrame(travel, 7), "anticipation");
  assert.equal(spritePhaseAtFrame(travel, 8), "action");
  assert.equal(spritePhaseAtFrame(travel, 55), "action");
  assert.equal(spritePhaseAtFrame(travel, 56), "recovery");
  assert.equal(spritePhaseAtFrame(travel, 71), "recovery");
  assert.equal(frameIndexAtControllerPhase(travel, "anticipation", 1), 7);
  assert.equal(frameIndexAtControllerPhase(travel, "action", 0), 8);
  assert.equal(frameIndexAtControllerPhase(travel, "action", 1), 55);
  assert.equal(frameIndexAtControllerPhase(travel, "recovery", 0), 56);
  assert.equal(frameIndexAtControllerPhase(travel, "recovery", 1), 71);
});

test("matching live controller phase wins at clip_start even after an atlas suspension", () => {
  const live = {
    token: "42",
    anim: "read",
    phase: "anticipation",
    enteredAt: 100,
    phaseStartedAt: 100,
    phaseEndsAt: 600,
  };
  const accepted = {
    clip: "read" as const,
    token: "stale",
    anim: "read",
    phase: "none",
    enteredAt: 20,
    phaseStartedAt: 20,
    phaseEndsAt: null,
  };
  assert.equal(resolveSpriteControllerSource("read", "read", live, accepted), live);
  assert.equal(
    resolveSpriteControllerSource("read", "idle", { ...live, anim: "idle", phase: "action" }, accepted),
    null,
    "a stale accepted source cannot impersonate a live root that has moved on",
  );
  assert.equal(
    resolveSpriteControllerSource("read", null, null, accepted),
    accepted,
    "isolated/Lab playback retains its accepted source without a rig root",
  );
});

test("event windows reserve sleep loop_end for exit and drain completion exactly once", () => {
  const sleep = semanticFixture().clips.sleep!;
  sleep.events = [
    { frame: 0, type: "clip_start" },
    { frame: 16, type: "sleep_loop_enter" },
    { frame: 36, type: "sleep_breath" },
    { frame: 68, type: "sleep_breath" },
    { frame: 80, type: "sleep_murmur" },
    { frame: 95, type: "sleep_loop_end" },
    { frame: 96, type: "sleep_exit" },
    { frame: 111, type: "clip_complete" },
  ];
  const emitted = new Set(sleep.events.slice(0, 5).map((event) => `${event.frame}:${event.type}`));
  assert.deepEqual(
    spritePresentationEventsForStep(sleep, sleep.events, emitted, 95),
    [],
    "an arbitrary 95→16 hold wrap is not the authored end of persistent sleep",
  );

  const exiting = spritePresentationEventsForStep(sleep, sleep.events, emitted, 96, { exitActive: true });
  assert.deepEqual(exiting.map(({ event, observedFrame }) => [event.frame, event.type, observedFrame]), [
    [95, "sleep_loop_end", 96],
    [96, "sleep_exit", 96],
  ]);
  exiting.forEach(({ key }) => emitted.add(key));
  assert.equal(
    preservesSpritePresentationEventWindow("sleep", "sleep", sleep, true),
    true,
    "wake changes the sprite token, not the authored sleep performance",
  );
  assert.equal(preservesSpritePresentationEventWindow("sleep", "idle", sleep, true), false);

  const completed = spritePresentationEventsForStep(sleep, sleep.events, emitted, 111, {
    exitActive: true,
    terminal: true,
  });
  assert.deepEqual(completed.map(({ event, observedFrame }) => [event.frame, event.type, observedFrame]), [
    [111, "clip_complete", 111],
  ]);
  completed.forEach(({ key }) => emitted.add(key));
  assert.deepEqual(
    spritePresentationEventsForStep(sleep, sleep.events, emitted, 111, { exitActive: true, terminal: true }),
    [],
    "the terminal drain is idempotent",
  );
});

test("a natural one-shot transition drains its final marker before idle", () => {
  const manifest = semanticFixture();
  const read = manifest.clips.read!;
  read.events = [
    { frame: 0, type: "clip_start" },
    { frame: 83, type: "clip_complete" },
  ];
  const machine = new NiumpiSpriteMachine(manifest, "read", 100);
  const outgoing = machine.snapshot();
  const incoming = machine.advance(100 + read.durationMs + 0.1);
  assert.equal(outgoing.clip, "read");
  assert.equal(incoming.clip, "idle");
  assert.notEqual(outgoing.token, incoming.token);
  const pending = spritePresentationEventsForStep(
    read,
    read.events,
    new Set(["0:clip_start"]),
    read.frameCount - 1,
    { terminal: true },
  );
  assert.deepEqual(pending.map(({ event, observedFrame }) => [event.type, observedFrame]), [
    ["clip_complete", 83],
  ]);
});

test("reduced playback uses authored safe poses and a deterministic event subset", () => {
  const manifest = semanticFixture();
  const read = manifest.clips.read!;
  read.events = [
    { frame: 0, type: "clip_start" },
    { frame: 10, type: "prop_attach", payload: { prop: "book" } },
    { frame: 24, type: "reading_pass", payload: { pass: 1 } },
    { frame: 34, type: "reading_pass", payload: { pass: 2 } },
    { frame: 40, type: "page_turn" },
    { frame: 76, type: "prop_detach", payload: { prop: "book" } },
    { frame: 83, type: "clip_complete" },
  ];
  const enterMs = read.playback!.enterBlendFrames * (1000 / read.fps);
  assert.equal(reducedFrameIndexAtElapsed(read, 0), 0);
  assert.equal(reducedFrameIndexAtElapsed(read, enterMs + 20), read.playback!.reducedPoseFrame);
  assert.equal(reducedFrameIndexAtElapsed(read, read.durationMs + 1), read.frameCount - 1);
  assert.deepEqual(reducedEventsForClip(read).map((event) => event.type), ["prop_attach", "reading_pass", "prop_detach"]);

  const sleep = manifest.clips.sleep!;
  const held = reducedFrameIndexAtElapsed(sleep, sleep.durationMs * 5);
  assert.equal(held, sleep.playback!.reducedPoseFrame, "persistent sleep holds its declared low-motion pose");
  assert.ok(reducedFrameIndexAtElapsed(sleep, 0, 10_000) >= sleep.playback!.exitRange!.startFrame);
  assert.deepEqual(reducedEventsForClip(manifest.clips.idle), [], "ambient core clips emit no reduced-mode presentation noise");

  assert.equal(reducedFrameIndexAtControllerPhase(read, "anticipation", 1), 11);
  assert.equal(spritePhaseAtFrame(read, reducedFrameIndexAtControllerPhase(read, "anticipation", 1)), "anticipation");
  assert.equal(spritePhaseAtFrame(read, reducedFrameIndexAtControllerPhase(read, "action", 1)), "action");
  assert.equal(spritePhaseAtFrame(read, reducedFrameIndexAtControllerPhase(read, "recovery", 0)), "recovery");
  assert.equal(reducedFrameIndexAtControllerPhase(read, "recovery", 1), read.frameCount - 1);
});

test("higher-priority gameplay interrupts while ambient noise cannot steal a one-shot", () => {
  const manifest = fixture();
  const machine = new NiumpiSpriteMachine(manifest, "tap_reaction", 0);
  assert.equal(machine.request("blink", 100, "ambient").accepted, false);
  assert.equal(machine.request("eat", 150, "gameplay").accepted, true);
  assert.equal(machine.snapshot().clip, "eat");
});

test("favorite feeding keeps a durable eat then happy sequence while happy decode is deferred", async () => {
  const manifest = fixture();
  const machine = new NiumpiSpriteMachine(manifest, "idle", 0);
  let resolveHappy!: () => void;
  let happyDecoded = false;
  const delayedHappy = new Promise<void>((resolve) => { resolveHappy = resolve; }).then(() => { happyDecoded = true; });
  const sequence = machine.requestSequence(["eat", "happy"], 10, "gameplay");
  machine.request("idle", 20, "gameplay");
  assert.equal(machine.snapshot().clip, "eat");
  assert.equal(sequence.snapshot.sequenceToken, 1);
  const afterEat = machine.advance(10 + manifest.clips.eat.durationMs + 1);
  assert.equal(afterEat.clip, "happy");
  assert.equal(happyDecoded, false, "happy intent must survive before its atlas resolves");
  resolveHappy();
  await delayedHappy;
  machine.shiftClock(700);
  assert.equal(machine.advance(afterEat.enteredAt + 700 + manifest.clips.happy.durationMs - 1).clip, "happy", "atlas wait must not skip happy");
  const afterHappy = machine.advance(afterEat.enteredAt + 700 + manifest.clips.happy.durationMs + 1);
  assert.equal(afterHappy.clip, "idle");
  assert.notEqual(machine.snapshot().queued, "eat");
});

test("root intents ignore phase-only class churn and ambient is suppressed during sleep", () => {
  const favorite = spriteIntentForRigRoot(fakeRoot({
    classes: ["rig-root", "behavior-eating-favorite", "phase-action"],
    anim: "eat",
    token: "42",
    prop: "moonberry",
  }));
  const sameBehaviorNewPhase = spriteIntentForRigRoot(fakeRoot({
    classes: ["rig-root", "behavior-eating-favorite", "phase-recovery", "is-target", "is-blinking"],
    anim: "eat",
    token: "42",
    prop: "moonberry",
  }));
  assert.equal(favorite.key, sameBehaviorNewPhase.key);
  assert.equal(favorite.favoriteFeed, true);
  assert.equal(rigAllowsAmbient(fakeRoot({ classes: ["behavior-asleep"], anim: "sleep" })), false);
  assert.equal(rigAllowsAmbient(fakeRoot()), true);
});

test("semantic look follows gaze deterministically and sleep still suppresses ambient", () => {
  assert.equal(clipForRigRoot(fakeRoot({ anim: "look", token: "8", gazeTargetX: 14 })), "look_right");
  assert.equal(clipForRigRoot(fakeRoot({ anim: "look", token: "9", gazeTargetX: -12 })), "look_left");
  assert.equal(clipForRigRoot(fakeRoot({ anim: "look", token: "8", renderedGazeX: "-3.5px" })), "look_left");
  assert.equal(clipForRigRoot(fakeRoot({ anim: "look", token: "9" })), "look_left");
  assert.equal(clipForRigRoot(fakeRoot({ anim: "look", token: "9" })), "look_left", "seeded token parity must not drift between renders");
  assert.equal(rigAllowsAmbient(fakeRoot({ anim: "sleep", classes: ["behavior-sleep"] })), false);
});

test("real controller and legacy behavior names map to the nine semantic clips", () => {
  const cases: Array<[string, NiumpiSpriteClip]> = [
    ["sad", "sad"], ["sleepy", "sad"],
    ["walk", "travel"], ["hover", "travel"], ["land", "travel"], ["wander", "travel"], ["returning", "travel"],
    ["sleep", "sleep"], ["asleep", "sleep"],
    ["read", "read"], ["book", "read"], ["lamp", "lamp"],
    ["dance", "dance"], ["dancing", "dance"], ["sing", "sing"], ["singing", "sing"],
    ["roll", "roll"], ["sway", "cozy"], ["cozy-rest", "cozy"], ["cozy", "cozy"],
  ];
  for (const [semantic, expected] of cases) {
    assert.equal(clipForRigRoot(fakeRoot({ anim: semantic })), expected, semantic);
  }
  assert.equal(clipForRigRoot(fakeRoot({ anim: "sleep", classes: ["is-blinking"] })), "sleep", "sleep suppresses stale blink presentation");
  assert.equal(clipForRigRoot(fakeRoot({ anim: "read", classes: ["is-blinking"] })), "read", "ambient blink cannot steal an authored activity");
  assert.equal(clipForRigRoot(fakeRoot({ anim: "idle", classes: ["is-blinking"] })), "blink");
});

test("sleep enters once, loops only its hold, and exits only on a forced wake", () => {
  const manifest = semanticFixture();
  const sleep = manifest.clips.sleep!;
  const machine = new NiumpiSpriteMachine(manifest, "sleep", 0);
  const loopStart = elapsedAtFrame(sleep, 16);
  const loopDuration = elapsedAtFrame(sleep, 96) - loopStart;
  assert.equal(frameIndexAtElapsed(sleep, loopStart), 16);
  assert.equal(frameIndexAtElapsed(sleep, loopStart + loopDuration + 0.1), 16);
  assert.equal(machine.request("read", 1_000, "gameplay").accepted, false, "ordinary room action cannot interrupt sleep");
  const waking = machine.request("read", 1_100, "gameplay", false, true);
  assert.equal(waking.accepted, true);
  assert.equal(waking.snapshot.clip, "sleep");
  assert.equal(waking.snapshot.queued, "read");
  assert.equal(frameIndexAtElapsed(sleep, 1_100, true, 0), 96);
  const exitDuration = elapsedAtFrame(sleep, 111) - elapsedAtFrame(sleep, 96) + sleep.frames[111].durationMs;
  assert.equal(machine.advance(1_100 + exitDuration - 0.1).clip, "sleep");
  assert.equal(machine.advance(1_100 + exitDuration + 0.1).clip, "read");
});

test("semantic priorities preserve explicit replacements and grounded repeat queues", () => {
  const manifest = semanticFixture();
  const performance = new NiumpiSpriteMachine(manifest, "read", 0);
  assert.equal(performance.request("dance", 100, "gameplay").accepted, true, "explicit dance may replace an equal-priority quiet activity");
  assert.equal(performance.snapshot().clip, "dance");
  assert.equal(performance.request("roll", 200, "gameplay").queued, true, "an unpermitted equal-priority cut waits for recovery");

  const roll = new NiumpiSpriteMachine(manifest, "roll", 0);
  assert.equal(roll.request("roll", 100, "gameplay", true).queued, true, "a second roll must never restart mid-rotation");

  const cozy = new NiumpiSpriteMachine(manifest, "sad", 0);
  assert.equal(cozy.request("cozy", 100, "gameplay").accepted, true);
  assert.equal(cozy.snapshot().clip, "cozy");
  assert.equal(cozy.request("sad", 200, "gameplay").queued, true, "sad cannot snap a held cozy contact pose");
});

test("controller-clock synchronization closes a shortened semantic timeline without replay", () => {
  const manifest = semanticFixture();
  const machine = new NiumpiSpriteMachine(manifest, "read", 100);
  const before = machine.snapshot();
  const synced = machine.synchronize("idle", 580);
  assert.equal(synced.clip, "idle");
  assert.equal(synced.enteredAt, 580);
  assert.equal(synced.queued, null);
  assert.ok(synced.token > before.token);
  assert.equal(machine.advance(20_000).clip, "idle");
});

test("presentation prop cleanup is synthesized exactly once on interruption", () => {
  const ledger = new SpritePresentationEventLedger();
  ledger.observe({ frame: 10, type: "prop_attach", payload: { prop: "book" } }, "read", 10, 7);
  assert.equal(ledger.presentationProp(), "book");
  assert.deepEqual(ledger.interrupt(), {
    type: "prop_detach", clip: "read", authoredFrame: 10, observedFrame: 10,
    payload: { prop: "book" }, spriteToken: 7,
  });
  assert.equal(ledger.presentationProp(), null);
  assert.equal(ledger.interrupt(), null);
  ledger.observe({ frame: 10, type: "prop_attach" }, "read", 10);
  ledger.observe({ frame: 76, type: "prop_detach" }, "read", 76);
  assert.equal(ledger.interrupt(), null, "authored detach must prevent duplicate cleanup");
});

test("a newer semantic intent invalidates a delayed atlas request", () => {
  const gate = new SpriteIntentGate();
  const delayedEat = gate.begin("42:eat:standard:moonberry:blink-off");
  assert.equal(typeof delayedEat, "number");
  assert.equal(gate.begin("42:eat:standard:moonberry:blink-off"), null, "phase churn is not a new intent");
  const idle = gate.begin("43:idle:standard:no-prop:blink-off");
  assert.equal(typeof idle, "number");
  assert.equal(gate.isCurrent(delayedEat as number), false);
  assert.equal(gate.isCurrent(idle as number), true);
});

test("a user reaction immediately outranks an ambient blink", () => {
  const manifest = fixture();
  const machine = new NiumpiSpriteMachine(manifest, "blink", 0);
  const request = machine.request("tap_reaction", 100, "gameplay");
  assert.equal(request.accepted, true);
  assert.equal(request.snapshot.clip, "tap_reaction");
});

test("rapid repeated taps never restart the active one-shot", () => {
  const manifest = fixture();
  const machine = new NiumpiSpriteMachine(manifest, "tap_reaction", 10);
  const original = machine.snapshot();
  for (let index = 0; index < 8; index += 1) machine.request("tap_reaction", 20 + index * 10, "gameplay", true);
  const protectedSnapshot = machine.snapshot();
  assert.equal(protectedSnapshot.enteredAt, original.enteredAt);
  assert.equal(protectedSnapshot.queued, "tap_reaction");
  assert.equal(machine.advance(10 + manifest.clips.tap_reaction.durationMs + 1).clip, "tap_reaction");
});

test("one-shots settle to idle and pause shifts preserve their elapsed pose", () => {
  const manifest = fixture();
  const machine = new NiumpiSpriteMachine(manifest, "happy", 100);
  machine.shiftClock(500);
  assert.equal(machine.snapshot().enteredAt, 600);
  assert.equal(machine.advance(600 + manifest.clips.happy.durationMs - 1).clip, "happy");
  assert.equal(machine.advance(600 + manifest.clips.happy.durationMs + 1).clip, "idle");
  machine.seek(4_000, 500);
  assert.equal(machine.snapshot().enteredAt, 3_500);
});

test("visibility suspension preserves hatch and feed timing without event bursts", () => {
  const manifest = fixture();
  for (const name of ["hatch_complete", "eat"] as const) {
    const definition = manifest.clips[name];
    assert.ok(definition);
    const machine = new NiumpiSpriteMachine(manifest, name, 100);
    const beforeHide = 100 + elapsedAtFrame(definition, 12) + 0.1;
    const before = machine.advance(beforeHide);
    const frameBeforeHide = frameIndexAtElapsed(definition, beforeHide - before.enteredAt, false);
    machine.shiftClock(8_000);
    const afterShow = machine.advance(beforeHide + 8_000);
    assert.equal(afterShow.clip, name);
    assert.equal(afterShow.enteredAt, before.enteredAt + 8_000);
    const frameAfterShow = frameIndexAtElapsed(definition, beforeHide + 8_000 - afterShow.enteredAt, false);
    assert.equal(frameAfterShow, frameBeforeHide);
    const eventsBefore = definition.events.filter((event) => event.frame <= frameBeforeHide).length;
    const eventsAfter = definition.events.filter((event) => event.frame <= frameAfterShow).length;
    assert.equal(eventsAfter, eventsBefore, "resuming must not synthesize skipped one-shot events");
  }
});

test("a deferred atlas page freezes the same machine clock and cannot burst one-shot events", async () => {
  const manifest = fixture();
  const definition = manifest.clips.eat;
  const machine = new NiumpiSpriteMachine(manifest, "eat", 100);
  const beforeDecode = 100 + elapsedAtFrame(definition, 12) + 0.1;
  const before = machine.advance(beforeDecode);
  const frameBefore = frameIndexAtElapsed(definition, beforeDecode - before.enteredAt, false);
  const eventsBefore = definition.events.filter((event) => event.frame <= frameBefore).length;
  const suspension = new SpritePlaybackSuspension();
  assert.equal(suspension.suspend("atlas", beforeDecode), true);

  let finishDecode!: () => void;
  const deferredDecode = new Promise<void>((resolve) => { finishDecode = resolve; });
  const resumeAfterDecode = deferredDecode.then(() => suspension.resume("atlas", beforeDecode + 4_000));
  finishDecode();
  const resumed = await resumeAfterDecode;
  assert.equal(resumed.removed, true);
  assert.equal(resumed.fullyResumed, true);
  assert.ok(Math.abs(resumed.shiftMs - 4_000) < 0.001);
  machine.shiftClock(resumed.shiftMs);

  const after = machine.advance(beforeDecode + 4_000);
  const frameAfter = frameIndexAtElapsed(definition, beforeDecode + 4_000 - after.enteredAt, false);
  const eventsAfter = definition.events.filter((event) => event.frame <= frameAfter).length;
  assert.equal(frameAfter, frameBefore, "decode latency must not skip authored frames");
  assert.equal(eventsAfter, eventsBefore, "decode latency must not synthesize skipped bite events");

  assert.equal(suspension.suspend("viewport", beforeDecode + 5_000), true);
  assert.equal(suspension.suspend("document", beforeDecode + 5_100), true);
  assert.deepEqual(suspension.resume("document", beforeDecode + 6_000), {
    removed: true, fullyResumed: false, shiftMs: 0,
  });
  assert.equal(suspension.resume("viewport", beforeDecode + 7_000).shiftMs, 2_000,
    "overlapping reasons shift once from the first suspension");
});

test("an unseen required-atlas token resumes from its accepted frame zero", () => {
  const manifest = fixture();
  const definition = manifest.clips.eat;
  const acceptedAt = 100;
  const suspendAt = acceptedAt + 500;
  const resumeAt = suspendAt + 4_000;
  const machine = new NiumpiSpriteMachine(manifest, "eat", acceptedAt);
  const active = machine.snapshot();
  const shift = spriteClockShiftOnResume(
    resumeAt - suspendAt,
    resumeAt,
    active.enteredAt,
    active.token,
    active.token - 1,
  );
  machine.shiftClock(shift);

  const resumed = machine.advance(resumeAt);
  const firstFrame = frameIndexAtElapsed(definition, resumeAt - resumed.enteredAt, false);
  assert.equal(shift, resumeAt - acceptedAt,
    "the pre-suspend scheduling gap is loading time when no action frame was painted");
  assert.equal(firstFrame, 0);
  assert.equal(foodPropStateAtFrame(definition, firstFrame, "moonberry").bites, 0);

  const alreadyPresentedShift = spriteClockShiftOnResume(
    resumeAt - suspendAt,
    resumeAt,
    active.enteredAt,
    active.token,
    active.token,
  );
  assert.equal(alreadyPresentedShift, resumeAt - suspendAt,
    "later pages preserve the elapsed pose of a token that was already visible");
});

test("the Canvas ordering commits a semantic before decode and defers root idle until after clock shift", async () => {
  const manifest = semanticFixture();
  const read = manifest.clips.read!;
  const machine = new NiumpiSpriteMachine(manifest, "idle", 0);
  const controllerEnteredAt = 100;
  const accepted = machine.request("read", controllerEnteredAt, "gameplay");
  assert.equal(accepted.accepted, true, "the semantic intent is committed synchronously, before atlas decode");
  const suspension = new SpritePlaybackSuspension();
  suspension.suspend("atlas", controllerEnteredAt);
  const beforeFrame = frameIndexAtElapsed(read, 0, false);

  let releasePage!: () => void;
  const page = new Promise<void>((resolve) => { releasePage = resolve; });
  let rootIdleDeferred = true;
  const decoded = page.then(() => {
    const resumed = suspension.resume("atlas", controllerEnteredAt + read.durationMs + 4_000);
    machine.shiftClock(resumed.shiftMs);
    if (rootIdleDeferred) {
      rootIdleDeferred = false;
      machine.request("idle", controllerEnteredAt + read.durationMs, "gameplay");
    }
    return resumed;
  });
  releasePage();
  const resumed = await decoded;
  const now = controllerEnteredAt + read.durationMs + 4_000;
  const after = machine.advance(now);
  const afterFrame = frameIndexAtElapsed(read, now - after.enteredAt, false);
  assert.equal(after.clip, "read", "controller semantic→idle during decode must queue, not erase, the authored one-shot");
  assert.equal(afterFrame, beforeFrame, "the first decoded draw remains at the accepted semantic pose");
  assert.ok(resumed.shiftMs > read.durationMs, "the regression requires a stall longer than the whole clip");
  assert.equal(
    read.events.filter((event) => event.frame <= afterFrame).length,
    read.events.filter((event) => event.frame <= beforeFrame).length,
    "resume cannot burst any marker that was not due at intent acceptance",
  );
});

test("the shipped player owns one requestAnimationFrame loop and cancels it on cleanup", () => {
  const source = readFileSync(join(process.cwd(), "app/ui/niumpi/NiumpiFrameCanvas.tsx"), "utf8");
  assert.match(source, /requestAnimationFrame\(draw\)/);
  assert.match(source, /cancelAnimationFrame\(frameRequest\)/);
  assert.match(source, /observer\?\.disconnect\(\)/);
  assert.match(source, /resizeObserver\?\.disconnect\(\)/);
  assert.match(source, /intersectionObserver\?\.disconnect\(\)/);
  assert.match(source, /addEventListener\("visibilitychange"/);
  assert.match(source, /removeEventListener\("visibilitychange"/);
  assert.match(source, /dataset\.loopStopped/);
  assert.match(source, /machine\.shiftClock\(sharedShiftMs\)/);
  assert.match(source, /spriteClockShiftOnResume\(/);
  assert.match(source, /new SpritePlaybackSuspension\(\)/);
  assert.match(source, /if \(suspension\.active\) \{\s*deferredRootIntent = true;/);
  assert.match(source, /const waitsForActiveAtlas = needsAtlas && machine\.snapshot\(\)\.clip === clip;/);
  assert.match(source, /reloadSpriteManifest\(variant, recoveryRef\.current\.staleManifest\)/);
  assert.match(source, /dataset\.schemaVersion/);
  assert.match(source, /intentGate\.isCurrent\(generation\)/);
  assert.match(source, /dataset\.missingSemanticClip/);
  assert.match(source, /niumpi:presentation-event/);
  assert.match(source, /dataset\.presentationProp/);
  assert.match(source, /reducedFrameIndexAtElapsed/);
  assert.match(source, /reducedFrameIndexAtControllerPhase/);
  assert.match(source, /data-motion-entered-at/);
  assert.match(source, /nb-presentation-layer/);
  assert.match(source, /MAX_LOCAL_DECODED_BYTES/);
  assert.match(source, /purpose === "prefetch" && localDecodedBytes \+ decodedBytes > MAX_LOCAL_DECODED_BYTES/);
  assert.match(source, /atlasFor\(snapshot\.clip, requiredPage\)/);
  assert.match(source, /clearTimeout\(warmTimer\)/);
  assert.match(source, /const loaded = forceReload\s*\? await reloadSpriteManifest\(variant, recoveryRef\.current\.staleManifest\)\s*: await loadSpriteManifest\(variant\);\s*if \(disposed\) return;/, "a stale variant response must not replace the current player");
  assert.doesNotMatch(source, /import\("three"\)/);
  const lab = readFileSync(join(process.cwd(), "app/ui/AnimationLab.tsx"), "utf8");
  assert.match(lab, /manifestSpriteClips\(loaded\)/, "Lab clip controls must come from the loaded variant manifest");
  assert.doesNotMatch(lab, /animationClipsForVariant/, "Lab must not advertise a static global clip catalog");
});

test("atlas failures latch during backoff and only controlled invalidation retries", async () => {
  const originalImage = globalThis.Image;
  let instances = 0;
  class FakeImage {
    decoding = "async";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private value = "";
    constructor() { instances += 1; }
    set src(value: string) {
      this.value = value;
      queueMicrotask(() => value.includes("broken") ? this.onerror?.() : this.onload?.());
    }
    get src() { return this.value; }
    decode() { return Promise.resolve(); }
  }
  Object.defineProperty(globalThis, "Image", { value: FakeImage, configurable: true, writable: true });
  try {
    clearSpriteAssetCacheForTests();
    const [first, second] = await Promise.all([loadSpriteAtlas("/idle.webp"), loadSpriteAtlas("/idle.webp")]);
    assert.equal(first, second);
    assert.equal(instances, 1);
    releaseSpriteAtlas("/idle.webp");
    releaseSpriteAtlas("/idle.webp");
    const broken = "/assets/niumpi/v2/baby/atlases/broken.webp";
    await assert.rejects(loadSpriteAtlas(broken));
    await assert.rejects(loadSpriteAtlas(broken));
    assert.equal(instances, 2, "a latched failure must not hot-loop a second Image request");
    invalidateSpriteVariant("baby");
    await assert.rejects(loadSpriteAtlas(broken));
    assert.equal(instances, 3, "one controlled variant invalidation permits one fresh request");
  } finally {
    clearSpriteAssetCacheForTests();
    Object.defineProperty(globalThis, "Image", { value: originalImage, configurable: true, writable: true });
  }
});

test("shared atlas cache is byte-aware and a disposed delayed variant cannot retain decoded memory", async () => {
  const originalImage = globalThis.Image;
  const images = new Map<string, DelayedImage>();
  class DelayedImage {
    decoding = "async";
    naturalWidth = 4096;
    naturalHeight = 4096;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    removed = false;
    private value = "";
    set src(value: string) { this.value = value; images.set(value, this); }
    get src() { return this.value; }
    decode() { return Promise.resolve(); }
    removeAttribute(name: string) { if (name === "src") this.removed = true; }
    finish() { this.onload?.(); }
  }
  Object.defineProperty(globalThis, "Image", { value: DelayedImage, configurable: true, writable: true });
  try {
    clearSpriteAssetCacheForTests();
    const pageBytes = 64 * 1024 * 1024;
    const stale = loadSpriteAtlas("/stage-2/idle-0.webp", pageBytes);
    releaseSpriteAtlas("/stage-2/idle-0.webp");
    const current = loadSpriteAtlas("/stage-3/idle-0.webp", pageBytes);
    assert.deepEqual(spriteAtlasCacheStatsForTests(), {
      entries: 2, pending: 2, activeReferences: 1, retainedDecodedBytes: 0,
      budgetBytes: MAX_GLOBAL_ATLAS_DECODED_BYTES,
    });

    images.get("/stage-2/idle-0.webp")?.finish();
    await stale;
    assert.equal(images.get("/stage-2/idle-0.webp")?.removed, true);
    assert.deepEqual(spriteAtlasCacheStatsForTests(), {
      entries: 1, pending: 1, activeReferences: 1, retainedDecodedBytes: 0,
      budgetBytes: MAX_GLOBAL_ATLAS_DECODED_BYTES,
    }, "the late disposed variant must not resurrect in the cache");

    images.get("/stage-3/idle-0.webp")?.finish();
    await current;
    assert.equal(spriteAtlasCacheStatsForTests().retainedDecodedBytes, pageBytes);
    releaseSpriteAtlas("/stage-3/idle-0.webp");

    const second = loadSpriteAtlas("/stage-4/idle-0.webp", pageBytes);
    images.get("/stage-4/idle-0.webp")?.finish();
    await second;
    releaseSpriteAtlas("/stage-4/idle-0.webp");
    const stats = spriteAtlasCacheStatsForTests();
    assert.ok(stats.retainedDecodedBytes <= stats.budgetBytes, "global decoded retention must stay inside the mobile budget");
    assert.equal(stats.entries, 1, "the least-recently-used released page is disposed by bytes, not entry count");
  } finally {
    clearSpriteAssetCacheForTests();
    Object.defineProperty(globalThis, "Image", { value: originalImage, configurable: true, writable: true });
  }
});

test("manifest cache isolates variants and stale 404 recovery is explicit and cache-bypassing", async () => {
  const originalFetch = globalThis.fetch;
  const pending = new Map<string, (response: Response) => void>();
  const calls: Array<{ url: string; cache?: RequestCache }> = [];
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, cache: init?.cache });
    return new Promise<Response>((resolve) => pending.set(url, resolve));
  }) as typeof fetch;
  try {
    clearSpriteAssetCacheForTests();
    const oldBaby = loadSpriteManifest("baby");
    const sameBaby = loadSpriteManifest("baby");
    const newerStage = loadSpriteManifest("stage-2");
    assert.equal(oldBaby, sameBaby, "the same URL shares one in-flight request");
    assert.deepEqual(calls.map((call) => call.url), [spriteManifestUrl("baby"), spriteManifestUrl("stage-2")]);

    const stageFixture = fixture();
    stageFixture.variant = "stage-2";
    pending.get(spriteManifestUrl("stage-2"))?.(Response.json(stageFixture));
    assert.equal((await newerStage).variant, "stage-2");
    pending.get(spriteManifestUrl("baby"))?.(Response.json(fixture()));
    assert.equal((await oldBaby).variant, "baby", "a late previous response stays in its own cache key");

    clearSpriteAssetCacheForTests();
    let attempts = 0;
    const recoveryModes: Array<RequestCache | undefined> = [];
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      attempts += 1;
      recoveryModes.push(init?.cache);
      if (attempts === 1) return new Response(null, { status: 404 });
      const manifest = fixture();
      manifest.variant = "stage-3";
      return Response.json(manifest);
    }) as typeof fetch;
    await assert.rejects(loadSpriteManifest("stage-3"), /manifest failed \(404\)/);
    await assert.rejects(loadSpriteManifest("stage-3"), /manifest failed \(404\)/);
    assert.equal(attempts, 1, "a terminal failure is latched during backoff rather than hammered");
    const firstRecovery = reloadSpriteManifest("stage-3");
    const joinedRecovery = reloadSpriteManifest("stage-3");
    assert.equal(firstRecovery, joinedRecovery, "concurrent players coalesce onto one controlled recovery");
    assert.equal((await firstRecovery).variant, "stage-3");
    assert.equal(attempts, 2, "the controlled reload is the only request allowed through the latch");
    assert.deepEqual(recoveryModes, ["default", "reload"]);
  } finally {
    clearSpriteAssetCacheForTests();
    globalThis.fetch = originalFetch;
  }
});

test("Friends keeps one live production Canvas and renders secondary neighbours as approved stills", () => {
  const modes = [0, 1, 2, 3].map((index) => friendAvatarIsAnimated(index, false));
  assert.equal(modes.filter(Boolean).length, MAX_LIVE_FRIEND_AVATARS);
  assert.ok(64 * 1024 * 1024 * MAX_LIVE_FRIEND_AVATARS <= MAX_GLOBAL_ATLAS_DECODED_BYTES,
    "one maximum legacy atlas page remains below the hard mobile cache budget");
  assert.equal([0, 1, 2].some((index) => friendAvatarIsAnimated(index, true)), false,
    "opening a visit overlay suspends every list avatar");

  const friends = readFileSync(join(process.cwd(), "app/scenes/FriendsScene.tsx"), "utf8");
  const body = readFileSync(join(process.cwd(), "app/ui/niumpi/NiumpiBody.tsx"), "utf8");
  assert.match(friends, /animated=\{friendAvatarIsAnimated\(index, visiting !== null\)\}/);
  assert.match(body, /data-renderer="approved-still"/);
});

test("the Canvas food prop approaches, records three bite states and disappears on swallow", () => {
  const eat = fixture().clips.eat;
  const start = foodPropStateAtFrame(eat, 0, "moonberry");
  const first = foodPropStateAtFrame(eat, 8, "moonberry");
  const second = foodPropStateAtFrame(eat, 16, "moonberry");
  const third = foodPropStateAtFrame(eat, 24, "moonberry");
  const swallowed = foodPropStateAtFrame(eat, 32, "moonberry");
  assert.equal(start.active, true);
  assert.equal(start.bites, 0);
  assert.ok(first.x < start.x, "food must approach the mouth");
  assert.equal(first.x, 248);
  assert.equal(first.y, 338);
  assert.equal(first.bites, 1);
  assert.equal(second.bites, 2);
  assert.equal(third.bites, 3);
  assert.ok(third.scale < first.scale, "each bite must visibly reduce the prop");
  assert.equal(swallowed.active, false);

  const source = readFileSync(join(process.cwd(), "app/ui/niumpi/NiumpiFrameCanvas.tsx"), "utf8");
  assert.match(source, /dataset\.foodProp/);
  assert.match(source, /dataset\.foodBites/);
});

test("every declared available variant ships a complete unique production frame set", () => {
  assert.ok(NIUMPI_AVAILABLE_MODEL_VARIANTS.length > 0, "at least one production variant must be available");
  const gameplayClips = ["idle", "blink", "tap_reaction", "happy", "eat"] as const;
  for (const variant of NIUMPI_AVAILABLE_MODEL_VARIANTS) {
    const root = join(process.cwd(), "public/assets/niumpi/v2", variant);
    const path = join(root, "manifest.json");
    assert.ok(existsSync(path), `declared ${variant} manifest is missing`);
    const manifest = validateSpriteManifest(JSON.parse(readFileSync(path, "utf8")));
    assert.equal(manifest.variant, variant, `${variant} manifest identifies another form`);

    for (const name of spriteClipsForVariant(variant)) {
      const definition = manifest.clips[name];
      assert.ok(definition, `${variant}/${name} is required by the runtime catalog`);
      assert.equal(motionGateForClip(name, definition), "PASS", `${variant}/${name} rig proof fails its gate`);
      const atlas = definition.atlas;
      const pages = "pages" in atlas ? atlas.pages : [atlas];
      for (const page of pages) {
        const prefix = new RegExp(`^/assets/niumpi/v2/${variant}/`);
        const src = page.src.replace(prefix, "");
        assert.ok(existsSync(join(root, src)), `${variant}/${name} atlas page is missing: ${src}`);
      }
    }

    for (const name of gameplayClips) {
      const clip = manifest.clips[name];
      assert.deepEqual(clip.frames.map((frame) => frame.index), Array.from({ length: clip.frameCount }, (_, index) => index), `${variant}/${name} frame indices are not sequential`);
      const rectangles = new Set(clip.frames.map((frame) => `${frame.page ?? 0}:${frame.x}:${frame.y}:${frame.w}:${frame.h}`));
      assert.equal(rectangles.size, clip.frameCount, `${variant}/${name} reuses an atlas rectangle`);
    }

    if (variant === "baby") {
      // Authoring beats 34/48/62/72 are one-based; runtime frame indices are zero-based.
      assert.deepEqual(manifest.clips.eat.events.filter((event) => event.type === "bite").map((event) => event.frame), [33, 47, 61]);
      assert.equal(manifest.clips.eat.events.find((event) => event.type === "swallow")?.frame, 71);
    }
  }
});
