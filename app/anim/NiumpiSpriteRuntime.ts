export const NIUMPI_GAMEPLAY_SPRITE_CLIPS = [
  "idle",
  "blink",
  "look_left",
  "look_right",
  "tap_reaction",
  "happy",
  "eat",
] as const;

export const NIUMPI_SEMANTIC_SPRITE_CLIPS = [
  "sad",
  "travel",
  "sleep",
  "read",
  "lamp",
  "dance",
  "sing",
  "roll",
  "cozy",
] as const;

export const NIUMPI_SPRITE_CLIPS = [
  ...NIUMPI_GAMEPLAY_SPRITE_CLIPS,
  "hatch_complete",
  ...NIUMPI_SEMANTIC_SPRITE_CLIPS,
] as const;

export type NiumpiSpriteClip = (typeof NIUMPI_SPRITE_CLIPS)[number];
export type NiumpiGameplaySpriteClip = (typeof NIUMPI_GAMEPLAY_SPRITE_CLIPS)[number];
export type NiumpiSemanticSpriteClip = (typeof NIUMPI_SEMANTIC_SPRITE_CLIPS)[number];

/** Required today; semantic clips are discovered from each real manifest. */
export function spriteClipsForVariant(variant: string): readonly NiumpiSpriteClip[] {
  return variant === "baby"
    ? [...NIUMPI_GAMEPLAY_SPRITE_CLIPS, "hatch_complete"]
    : NIUMPI_GAMEPLAY_SPRITE_CLIPS;
}

export type SpriteFrame = {
  index: number;
  page?: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Logical-canvas destination for schema v3 trimmed frames. */
  offsetX?: number;
  offsetY?: number;
  anchorX: number;
  anchorY: number;
  durationMs: number;
};

export type SpriteEvent = {
  frame: number;
  type: string;
  payload?: Record<string, string | number | boolean>;
};

export type SpritePhase = "anticipation" | "action" | "recovery";

export type SpriteControllerSource = {
  token: string;
  anim: string;
  phase: string;
  enteredAt: number;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
};

export type SpriteControllerIntentSource = SpriteControllerSource & {
  clip: NiumpiSpriteClip;
};

export const NIUMPI_SPRITE_CLOCK_RESUME_EVENT = "niumpi:sprite-clock-resume";

export type SpriteClockResumeDetail = {
  shiftMs: number;
  motionToken: string | null;
};

/**
 * Returns the shared clock shift applied when a required atlas becomes ready.
 *
 * A newly accepted token has not presented any of its frames yet, so its
 * entire accepted-at -> decoded-at interval is loading time. Merely shifting
 * by the interval after `suspend()` preserves any observer/network scheduling
 * gap and can make the first visible frame start part-way through the action.
 * A token that was already painted is different: only the actual suspension
 * interval is removed so a later atlas page resumes at the same pose.
 */
export function spriteClockShiftOnResume(
  suspensionShiftMs: number,
  resumeAt: number,
  activeEnteredAt: number,
  activeToken: number,
  lastPresentedToken: number,
): number {
  const suspended = Number.isFinite(suspensionShiftMs) ? Math.max(0, suspensionShiftMs) : 0;
  if (activeToken === lastPresentedToken) return suspended;
  const unseenInterval = Number.isFinite(resumeAt) && Number.isFinite(activeEnteredAt)
    ? Math.max(0, resumeAt - activeEnteredAt)
    : 0;
  return Math.max(suspended, unseenInterval);
}

/**
 * The live controller is authoritative whenever it still names the sprite that
 * is on screen. This deliberately ignores an atlas-suspension bookkeeping
 * token: after decode, a matching live root must expose its real phase before
 * frame-zero events are dispatched. A stale accepted intent is only safe when
 * there is no live root (Animation Lab and isolated players).
 */
export function resolveSpriteControllerSource(
  activeClip: NiumpiSpriteClip,
  rootClip: NiumpiSpriteClip | null,
  rootSource: SpriteControllerSource | null,
  acceptedSource: SpriteControllerIntentSource | null,
): SpriteControllerSource | null {
  if (rootSource) return rootClip === activeClip ? rootSource : null;
  return acceptedSource?.clip === activeClip ? acceptedSource : null;
}

/**
 * A production presentation event emitted by the Canvas player. Authored and
 * observed frames are intentionally separate: a slow display may cross an
 * authored marker between two requestAnimationFrame callbacks.
 */
export type SpritePresentationEventDetail = {
  sequence: number;
  type: string;
  clip: NiumpiSpriteClip;
  authoredFrame: number;
  observedFrame: number;
  payload?: Record<string, string | number | boolean>;
  synthetic: boolean;
  spriteToken: number;
};

export type SpritePresentationEventStep = {
  event: SpriteEvent;
  key: string;
  observedFrame: number;
};

export type SpritePresentationEventStepOptions = {
  /** The persistent hold has been released into its authored exit range. */
  exitActive?: boolean;
  /** The machine is leaving this clip before another frame can be drawn. */
  terminal?: boolean;
};

export function spritePresentationEventKey(event: SpriteEvent): string {
  return `${event.frame}:${event.type}`;
}

/**
 * Pure event-window calculation shared by the Canvas player and unit tests.
 *
 * Persistent sleep owns frame 95 as the boundary between its repeated hold
 * and authored exit. It must not fire on an arbitrary loop wrap; the first exit
 * sample emits it immediately before frame 96. Terminal draining reports each
 * crossed marker at its authored frame so a display callback that lands on the
 * following clip cannot lose (or mis-order) the old clip's completion marker.
 */
export function spritePresentationEventsForStep(
  clip: SpriteClip,
  events: readonly SpriteEvent[],
  emittedKeys: ReadonlySet<string>,
  observedFrame: number,
  options: SpritePresentationEventStepOptions = {},
): SpritePresentationEventStep[] {
  const lastFrame = Math.max(0, clip.frameCount - 1);
  const safeObservedFrame = Math.max(0, Math.min(lastFrame, Math.round(observedFrame)));
  const upperFrame = options.terminal ? lastFrame : safeObservedFrame;
  const heldLoopBoundary = clip.playback?.loopRange
    ? clip.playback.loopRange.endFrameExclusive - 1
    : null;

  return events.flatMap((event) => {
    const key = spritePresentationEventKey(event);
    if (emittedKeys.has(key) || event.frame > upperFrame) return [];
    if (heldLoopBoundary !== null && !options.exitActive && !options.terminal
      && event.frame >= heldLoopBoundary) {
      return [];
    }
    return [{
      event,
      key,
      observedFrame: options.terminal ? event.frame : safeObservedFrame,
    }];
  });
}

/** Sleep changes sprite tokens when wake starts, but it is still one authored performance. */
export function preservesSpritePresentationEventWindow(
  previousClip: NiumpiSpriteClip | null,
  nextClip: NiumpiSpriteClip,
  clip: SpriteClip,
  exitActive: boolean,
): boolean {
  return previousClip === nextClip && Boolean(clip.playback?.loopRange) && exitActive;
}

export type SpriteRigProof = {
  animatedControls: string[];
  animatedChannels: string[];
  regions: string[];
  blinkClosure?: number;
};

export type SemanticClipPlayback = {
  priority: number;
  enterBlendFrames: number;
  exitBlendFrames: number;
  loopRange?: { startFrame: number; endFrameExclusive: number };
  exitRange?: { startFrame: number; endFrameExclusive: number };
  reducedPoseFrame: number;
};

export type SpriteAtlasPage = {
  src: string;
  width: number;
  height: number;
  /** Exact decoded RGBA working-set cost; required by schema v3. */
  decodedBytes?: number;
  /** Full content hash; required by schema v3. */
  sha256?: string;
};

export type SpriteClipEncoding = {
  format: "WebP";
  rgb: {
    lossy: boolean;
    quality: number | null;
    foregroundMAE: number;
    foregroundPSNR: number | null;
  };
  alpha: { lossless: true; meanAbsoluteError: number };
  thresholds: { foregroundMAEMax: number; foregroundPSNRMin: number; alphaMAE: 0 };
  selection: {
    strategy: "lowest-passing-quality" | "lossless-fallback";
    claim: "first-passing-declared-candidate" | "declared-candidates-exhausted";
    candidateQualities: number[];
    selectedQuality: number | null;
    predecessor: {
      quality: number;
      passes: false;
      foregroundMAE: number;
      foregroundPSNR: number | null;
      alphaMAE: number;
      failingFrames: number[];
    } | null;
    evaluatedQualities: number[];
    candidateProofs: Array<{
      quality: number;
      passes: boolean;
      foregroundMAE: number;
      foregroundPSNR: number | null;
      alphaMAE: number;
      failingFrames: number[];
    }>;
  };
  frameGate: {
    foregroundAlpha: ">0";
    allFramesPassed: true;
    frames: Array<{
      index: number;
      passes: true;
      foregroundMAE: number;
      foregroundPSNR: number | null;
      alphaMAE: number;
    }>;
  };
};

export type SpriteClip = {
  name: NiumpiSpriteClip;
  fps: number;
  frameCount: number;
  durationMs: number;
  loop: boolean;
  transition: { anticipationFrames: number; actionFrames: number; recoveryFrames: number };
  atlas: SpriteAtlasPage | { pages: SpriteAtlasPage[] };
  frames: SpriteFrame[];
  events: SpriteEvent[];
  rigProof: SpriteRigProof;
  playback?: SemanticClipPlayback;
  encoding?: SpriteClipEncoding;
};

export type SpriteClipCatalog = Record<NiumpiGameplaySpriteClip, SpriteClip>
  & Partial<Record<NiumpiSpriteClip, SpriteClip>>;

export type NiumpiSpriteManifest = {
  schemaVersion: 2 | 3;
  variant: string;
  fps: number;
  canvas: { width: number; height: number };
  anchor: { x: number; y: number };
  packing?: {
    mode: "trimmed-rgba-v1";
    transparentRGB: "zero-when-alpha-zero";
    sourceCanonicalization: {
      transparentRGB: "zero-when-alpha-zero";
      stage: "pre-encode";
    };
    decodedTransparentRGB: "unspecified-for-lossy-webp";
    gutterPx: 4;
    maxDecodedPageBytes: 44_040_192;
  };
  clips: SpriteClipCatalog;
  rigProof?: SpriteRigProof;
};

export type SpriteState =
  | "ENTERING"
  | "IDLE"
  | "BLINKING"
  | "LOOKING_LEFT"
  | "LOOKING_RIGHT"
  | "REACTING"
  | "EATING"
  | "HAPPY"
  | "SAD"
  | "TRAVELLING"
  | "SLEEPING"
  | "READING"
  | "USING_LAMP"
  | "DANCING"
  | "SINGING"
  | "ROLLING"
  | "COZY";

export type SpriteRequestSource = "ambient" | "gameplay" | "lab";

/**
 * The first production atlas intentionally covers the eight clips above. Do
 * not imply that the portrait already has authored sleep/room/travel acting:
 * those semantics stay on a quiet idle pose until their dedicated clips ship.
 */
export const NIUMPI_PENDING_SPRITE_CLIPS = NIUMPI_SEMANTIC_SPRITE_CLIPS;

const STATE_FOR_CLIP: Record<NiumpiSpriteClip, SpriteState> = {
  hatch_complete: "ENTERING",
  idle: "IDLE",
  blink: "BLINKING",
  look_left: "LOOKING_LEFT",
  look_right: "LOOKING_RIGHT",
  tap_reaction: "REACTING",
  eat: "EATING",
  happy: "HAPPY",
  sad: "SAD",
  travel: "TRAVELLING",
  sleep: "SLEEPING",
  read: "READING",
  lamp: "USING_LAMP",
  dance: "DANCING",
  sing: "SINGING",
  roll: "ROLLING",
  cozy: "COZY",
};

const PRIORITY: Record<NiumpiSpriteClip, number> = {
  idle: 0,
  blink: 1,
  look_left: 1,
  look_right: 1,
  happy: 3,
  tap_reaction: 4,
  eat: 5,
  hatch_complete: 6,
  sad: 3,
  travel: 1,
  sleep: 5,
  read: 2,
  lamp: 2,
  dance: 2,
  sing: 2,
  roll: 2,
  cozy: 3,
};

export const SEMANTIC_CLIP_CONTRACT: Readonly<Record<NiumpiSemanticSpriteClip, {
  frameCount: number;
  transition: SpriteClip["transition"];
  playback: Omit<SemanticClipPlayback, "reducedPoseFrame">;
}>> = {
  sad: { frameCount: 48, transition: { anticipationFrames: 6, actionFrames: 30, recoveryFrames: 12 }, playback: { priority: 3, enterBlendFrames: 4, exitBlendFrames: 6 } },
  travel: { frameCount: 72, transition: { anticipationFrames: 8, actionFrames: 48, recoveryFrames: 16 }, playback: { priority: 1, enterBlendFrames: 4, exitBlendFrames: 6 } },
  sleep: {
    frameCount: 112,
    transition: { anticipationFrames: 16, actionFrames: 80, recoveryFrames: 16 },
    playback: {
      priority: 5,
      enterBlendFrames: 8,
      exitBlendFrames: 8,
      loopRange: { startFrame: 16, endFrameExclusive: 96 },
      exitRange: { startFrame: 96, endFrameExclusive: 112 },
    },
  },
  read: { frameCount: 84, transition: { anticipationFrames: 12, actionFrames: 56, recoveryFrames: 16 }, playback: { priority: 2, enterBlendFrames: 6, exitBlendFrames: 8 } },
  lamp: { frameCount: 48, transition: { anticipationFrames: 8, actionFrames: 24, recoveryFrames: 16 }, playback: { priority: 2, enterBlendFrames: 4, exitBlendFrames: 6 } },
  dance: { frameCount: 72, transition: { anticipationFrames: 8, actionFrames: 52, recoveryFrames: 12 }, playback: { priority: 2, enterBlendFrames: 4, exitBlendFrames: 6 } },
  sing: { frameCount: 96, transition: { anticipationFrames: 8, actionFrames: 72, recoveryFrames: 16 }, playback: { priority: 2, enterBlendFrames: 4, exitBlendFrames: 8 } },
  roll: { frameCount: 60, transition: { anticipationFrames: 8, actionFrames: 36, recoveryFrames: 16 }, playback: { priority: 2, enterBlendFrames: 4, exitBlendFrames: 8 } },
  cozy: { frameCount: 72, transition: { anticipationFrames: 12, actionFrames: 44, recoveryFrames: 16 }, playback: { priority: 3, enterBlendFrames: 6, exitBlendFrames: 8 } },
};

const SEMANTIC_CLIP_SET = new Set<string>(NIUMPI_SEMANTIC_SPRITE_CLIPS);

export function isSemanticSpriteClip(value: string): value is NiumpiSemanticSpriteClip {
  return SEMANTIC_CLIP_SET.has(value);
}

/** Ordered exactly like the runtime vocabulary, but filtered by real files. */
export function manifestSpriteClips(manifest: NiumpiSpriteManifest): NiumpiSpriteClip[] {
  return NIUMPI_SPRITE_CLIPS.filter((name) => Boolean(manifest.clips[name]));
}

export function resolveManifestClip(manifest: NiumpiSpriteManifest, requested: NiumpiSpriteClip): {
  clip: NiumpiSpriteClip;
  missingSemanticClip: NiumpiSemanticSpriteClip | null;
} {
  if (manifest.clips[requested]) return { clip: requested, missingSemanticClip: null };
  return {
    clip: "idle",
    missingSemanticClip: isSemanticSpriteClip(requested) ? requested : null,
  };
}

export type SpriteMachineSnapshot = {
  state: SpriteState;
  clip: NiumpiSpriteClip;
  enteredAt: number;
  token: number;
  queued: NiumpiSpriteClip | null;
  sequenceToken: number;
  /** Non-null only while a persistent semantic clip is playing its authored exit. */
  exitStartedAt: number | null;
};

/**
 * Playback-only state machine. Gameplay still owns rewards and inventory; this
 * class only protects authored one-shots from being cut in half by idle noise.
 */
export class NiumpiSpriteMachine {
  private readonly manifest: NiumpiSpriteManifest;
  private clip: NiumpiSpriteClip;
  private enteredAt: number;
  private token = 1;
  private queued: NiumpiSpriteClip[] = [];
  private sequenceToken = 0;
  private exitStartedAt: number | null = null;

  constructor(manifest: NiumpiSpriteManifest, initial: NiumpiSpriteClip, now: number) {
    this.manifest = manifest;
    this.clip = manifest.clips[initial] ? initial : "idle";
    this.enteredAt = now;
  }

  snapshot(): SpriteMachineSnapshot {
    return {
      state: STATE_FOR_CLIP[this.clip],
      clip: this.clip,
      enteredAt: this.enteredAt,
      token: this.token,
      queued: this.queued[0] ?? null,
      sequenceToken: this.sequenceToken,
      exitStartedAt: this.exitStartedAt,
    };
  }

  request(next: NiumpiSpriteClip, now: number, source: SpriteRequestSource = "gameplay", restart = false, force = false) {
    return this.requestSequence([next], now, source, restart, force);
  }

  /**
   * Commits an authored chain before any later clip has decoded. This lets a
   * favourite feed remain eat → happy even when the happy atlas arrives after
   * eat has ended; Canvas can pause on the missing page without losing intent.
   */
  requestSequence(
    sequence: readonly NiumpiSpriteClip[],
    now: number,
    source: SpriteRequestSource = "gameplay",
    restart = false,
    force = false,
  ) {
    const clips = sequence.filter((clip) => Boolean(this.manifest.clips[clip]));
    if (clips.length === 0) return { accepted: false, queued: false, snapshot: this.snapshot() };
    const [next, ...after] = clips;
    this.advance(now);
    const current = this.definition(this.clip);
    const currentFinished = !current.loop && now - this.enteredAt >= current.durationMs;

    if (next === this.clip && !restart) return { accepted: false, queued: false, snapshot: this.snapshot() };

    // Lab controls are explicit inspection tools. Restarting/selecting there is
    // the only path allowed to cut directly to a requested authored frame.
    if (source === "lab") {
      this.queued = after;
      this.sequenceToken += 1;
      this.enter(next, now);
      return { accepted: true, queued: false, snapshot: this.snapshot() };
    }

    // Sleep is the only persistent semantic loop. Waking never cuts from its
    // held pose to another atlas: a forced gameplay/system request first plays
    // the authored exit range and only then enters the queued destination.
    if (current.playback?.loopRange && current.playback.exitRange) {
      if (!force) return { accepted: false, queued: false, snapshot: this.snapshot() };
      this.queued = [...clips];
      this.sequenceToken += 1;
      // A newer wake destination may replace the queue, but phase/class churn
      // must never replay or lengthen an exit that is already in progress.
      if (this.exitStartedAt === null) {
        this.exitStartedAt = now;
        this.token += 1;
      }
      return { accepted: true, queued: true, snapshot: this.snapshot() };
    }

    if (!current.loop && !currentFinished && !force) {
      if (source === "ambient") return { accepted: false, queued: false, snapshot: this.snapshot() };
      if (["blink", "look_left", "look_right"].includes(this.clip) && source === "gameplay") {
        this.queued = after;
        this.sequenceToken += 1;
        this.enter(next, now);
        return { accepted: true, queued: false, snapshot: this.snapshot() };
      }
      if (this.priority(next) > this.priority(this.clip)) {
        this.queued = after;
        this.sequenceToken += 1;
        this.enter(next, now);
        return { accepted: true, queued: false, snapshot: this.snapshot() };
      }
      if (source === "gameplay" && this.canReplaceAtEqualPriority(this.clip, next)) {
        this.queued = after;
        this.sequenceToken += 1;
        this.enter(next, now);
        return { accepted: true, queued: false, snapshot: this.snapshot() };
      }
      // Keep one intentional reaction in reserve. Rapid repeated taps cannot
      // restart the current clip every few milliseconds or starve its settle.
      if (this.queued.length === 0 || this.priority(next) >= this.priority(this.queued[0])) {
        this.queued = [...clips];
        this.sequenceToken += 1;
      }
      return { accepted: false, queued: true, snapshot: this.snapshot() };
    }

    if (source === "ambient" && this.priority(next) < this.priority(this.clip)) {
      return { accepted: false, queued: false, snapshot: this.snapshot() };
    }

    this.queued = after;
    this.sequenceToken += 1;
    this.enter(next, now);
    return { accepted: true, queued: false, snapshot: this.snapshot() };
  }

  advance(now: number): SpriteMachineSnapshot {
    const current = this.definition(this.clip);
    if (current.playback?.loopRange && current.playback.exitRange) {
      if (this.exitStartedAt === null) return this.snapshot();
      const exitDuration = durationForFrameRange(current, current.playback.exitRange);
      if (now - this.exitStartedAt < exitDuration) return this.snapshot();
      const next = this.queued.shift() ?? "idle";
      this.enter(this.manifest.clips[next] ? next : "idle", this.exitStartedAt + exitDuration);
      return this.snapshot();
    }
    if (current.loop || now - this.enteredAt < current.durationMs) return this.snapshot();
    const next = this.queued.shift() ?? "idle";
    this.enter(this.manifest.clips[next] ? next : "idle", this.enteredAt + current.durationMs);
    return this.snapshot();
  }

  restart(now: number) {
    this.queued = [];
    this.exitStartedAt = null;
    this.enteredAt = now;
    this.token += 1;
    return this.snapshot();
  }

  seek(now: number, elapsedMs: number) {
    this.exitStartedAt = null;
    this.enteredAt = now - Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
    this.token += 1;
    return this.snapshot();
  }

  shiftClock(deltaMs: number) {
    if (Number.isFinite(deltaMs) && deltaMs > 0) {
      this.enteredAt += deltaMs;
      if (this.exitStartedAt !== null) this.exitStartedAt += deltaMs;
    }
  }

  /**
   * Trusted controller-clock hand-off. Gameplay uses ordinary `request`; the
   * Canvas adapter uses this only when the shared semantic controller has
   * already completed a reduced-motion timeline and entered a new token.
   */
  synchronize(next: NiumpiSpriteClip, enteredAt: number) {
    this.queued = [];
    this.sequenceToken += 1;
    this.enter(this.manifest.clips[next] ? next : "idle", enteredAt);
    return this.snapshot();
  }

  private enter(next: NiumpiSpriteClip, now: number) {
    this.clip = next;
    this.enteredAt = now;
    this.exitStartedAt = null;
    this.token += 1;
  }

  private definition(name: NiumpiSpriteClip): SpriteClip {
    return this.manifest.clips[name] ?? this.manifest.clips.idle;
  }

  private priority(name: NiumpiSpriteClip): number {
    return this.manifest.clips[name]?.playback?.priority ?? PRIORITY[name];
  }

  private canReplaceAtEqualPriority(current: NiumpiSpriteClip, next: NiumpiSpriteClip): boolean {
    if (this.priority(current) !== this.priority(next)) return false;
    if (["dance", "sing"].includes(next)
      && ["read", "lamp", "dance", "sing", "roll"].includes(current)) return true;
    return current === "sad" && next === "cozy";
  }
}

function durationForFrameRange(
  clip: SpriteClip,
  range: { startFrame: number; endFrameExclusive: number },
): number {
  let duration = 0;
  for (let index = range.startFrame; index < range.endFrameExclusive; index += 1) {
    duration += Math.max(1, clip.frames[index]?.durationMs ?? 0);
  }
  return Math.max(1, duration);
}

function frameInRangeAtElapsed(
  clip: SpriteClip,
  range: { startFrame: number; endFrameExclusive: number },
  elapsedMs: number,
  loop: boolean,
): number {
  const duration = durationForFrameRange(clip, range);
  const safe = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  const local = loop ? safe % duration : Math.min(safe, duration - 0.0001);
  let cursor = 0;
  for (let index = range.startFrame; index < range.endFrameExclusive; index += 1) {
    cursor += Math.max(1, clip.frames[index]?.durationMs ?? 0);
    if (local < cursor) return index;
  }
  return Math.max(range.startFrame, range.endFrameExclusive - 1);
}

export function frameIndexAtElapsed(
  clip: SpriteClip,
  elapsedMs: number,
  loop = clip.loop,
  exitElapsedMs: number | null = null,
): number {
  if (clip.frames.length === 0) return 0;
  const safe = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  const playback = clip.playback;
  if (playback?.loopRange && playback.exitRange) {
    if (exitElapsedMs !== null) return frameInRangeAtElapsed(clip, playback.exitRange, exitElapsedMs, false);
    const entryDuration = elapsedAtFrame(clip, playback.loopRange.startFrame);
    if (safe >= entryDuration) {
      return frameInRangeAtElapsed(clip, playback.loopRange, safe - entryDuration, loop);
    }
  }
  const duration = Math.max(1, clip.durationMs);
  const local = loop ? safe % duration : Math.min(safe, duration - 0.0001);
  let cursor = 0;
  for (let index = 0; index < clip.frames.length; index += 1) {
    cursor += Math.max(1, clip.frames[index].durationMs);
    if (local < cursor) return index;
  }
  return clip.frames.length - 1;
}

export function elapsedAtFrame(clip: SpriteClip, frame: number): number {
  const target = Math.max(0, Math.min(clip.frames.length - 1, Math.round(frame)));
  let elapsed = 0;
  for (let index = 0; index < target; index += 1) elapsed += Math.max(1, clip.frames[index].durationMs);
  return elapsed;
}

/** Exact, manifest-authored phase boundaries for UI diagnostics and tests. */
export function spritePhaseAtFrame(clip: SpriteClip, frame: number): SpritePhase {
  const safe = Math.max(0, Math.min(clip.frameCount - 1, Math.round(frame)));
  const actionStart = clip.transition.anticipationFrames;
  const recoveryStart = actionStart + clip.transition.actionFrames;
  if (safe < actionStart) return "anticipation";
  if (safe < recoveryStart) return "action";
  return "recovery";
}

function frameByProgress(start: number, end: number, progress: number): number {
  const unit = Math.max(0, Math.min(1, progress));
  return Math.round(start + (end - start) * unit);
}

function frameInPhaseByProgress(start: number, endExclusive: number, progress: number): number {
  const count = Math.max(1, endExclusive - start);
  const unit = Math.max(0, Math.min(1, progress));
  return start + Math.min(count - 1, Math.floor(unit * count));
}

/**
 * Maps the shared controller clock to the exact authored phase range. Unlike
 * raw elapsed-time sampling this cannot leave the sprite on anticipation's
 * final frame after the controller has atomically entered action.
 */
export function frameIndexAtControllerPhase(
  clip: SpriteClip,
  phase: SpritePhase,
  progress: number,
): number {
  if (clip.frames.length === 0) return 0;
  const actionStart = clip.transition.anticipationFrames;
  const recoveryStart = actionStart + clip.transition.actionFrames;
  if (phase === "anticipation") return frameInPhaseByProgress(0, actionStart, progress);
  if (phase === "action") return frameInPhaseByProgress(actionStart, recoveryStart, progress);
  return frameInPhaseByProgress(recoveryStart, clip.frameCount, progress);
}

/**
 * Reduced motion still uses the authored sprite and its declared safe pose.
 * It eases into/out of that pose using only a few frame changes instead of
 * swapping to a static fallback or playing the full high-amplitude clip.
 */
export function reducedFrameIndexAtElapsed(
  clip: SpriteClip,
  elapsedMs: number,
  exitElapsedMs: number | null = null,
): number {
  if (clip.frames.length === 0) return 0;
  const playback = clip.playback;
  if (!playback) return 0;
  const frameMs = 1000 / Math.max(1, clip.fps);
  const pose = Math.max(0, Math.min(clip.frameCount - 1, playback.reducedPoseFrame));

  if (exitElapsedMs !== null && playback.exitRange) {
    const start = Math.max(playback.exitRange.startFrame, pose);
    const end = Math.max(start, playback.exitRange.endFrameExclusive - 1);
    const duration = Math.max(frameMs, playback.exitBlendFrames * frameMs);
    return frameByProgress(start, end, exitElapsedMs / duration);
  }

  const safe = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  const enterDuration = Math.max(frameMs, playback.enterBlendFrames * frameMs);
  if (safe < enterDuration) return frameByProgress(0, pose, safe / enterDuration);
  if (playback.loopRange) return pose;

  const exitDuration = Math.max(frameMs, playback.exitBlendFrames * frameMs);
  const exitStart = Math.max(enterDuration, clip.durationMs - exitDuration);
  if (safe < exitStart) return pose;
  return frameByProgress(pose, clip.frameCount - 1, (safe - exitStart) / exitDuration);
}

/**
 * Maps the controller's reduced phase clock into frames that stay inside the
 * matching authored phase. This gives root and Canvas one timeline instead of
 * two independent shortened performances.
 */
export function reducedFrameIndexAtControllerPhase(
  clip: SpriteClip,
  phase: SpritePhase,
  progress: number,
): number {
  if (clip.frames.length === 0) return 0;
  const pose = Math.max(0, Math.min(clip.frameCount - 1, clip.playback?.reducedPoseFrame ?? 0));
  const anticipationEnd = Math.max(0, clip.transition.anticipationFrames - 1);
  const actionStart = clip.transition.anticipationFrames;
  const recoveryStart = actionStart + clip.transition.actionFrames;
  const last = clip.frameCount - 1;
  if (phase === "anticipation") {
    return frameByProgress(0, Math.min(pose, anticipationEnd), progress);
  }
  if (phase === "action") {
    const safePose = Math.max(actionStart, Math.min(recoveryStart - 1, pose));
    return frameByProgress(actionStart, safePose, Math.min(1, progress * 3));
  }
  const exitStart = clip.playback?.exitRange?.startFrame ?? recoveryStart;
  return frameByProgress(Math.max(recoveryStart, exitStart), last, progress);
}

const REDUCED_EVENT_TYPES: Readonly<Partial<Record<NiumpiSemanticSpriteClip, readonly string[]>>> = {
  sad: ["sad_sigh"],
  travel: ["travel_depart", "travel_arrive"],
  sleep: ["sleep_eyes_closed"],
  read: ["prop_attach", "reading_pass", "prop_detach"],
  lamp: ["lamp_contact", "lamp_glow"],
  dance: ["dance_beat", "dance_beat"],
  sing: ["vocal_phrase"],
  roll: ["roll_launch", "roll_land"],
  cozy: ["prop_attach", "cozy_contact", "cozy_sigh", "prop_detach"],
};

/** Returns the authored low-motion event subset, preserving duplicate beats. */
export function reducedEventsForClip(clip: SpriteClip): SpriteEvent[] {
  if (!isSemanticSpriteClip(clip.name)) return [];
  const wanted = [...(REDUCED_EVENT_TYPES[clip.name] ?? [])];
  return clip.events.filter((event) => {
    const index = wanted.indexOf(event.type);
    if (index < 0) return false;
    wanted.splice(index, 1);
    return true;
  });
}

export const NIUMPI_V3_MAX_DECODED_PAGE_BYTES = 44_040_192;
const NIUMPI_CODEC_MAX_FOREGROUND_MAE = 2.5;
const NIUMPI_CODEC_MIN_FOREGROUND_PSNR = 38;

export function decodedBytesForAtlasPage(page: SpriteAtlasPage): number {
  return page.decodedBytes ?? page.width * page.height * 4;
}

/**
 * Map a packed crop back into the stable logical canvas. Schema v2 frames do
 * not declare offsets and therefore retain their original full-canvas draw.
 */
export function spriteFrameDestinationRect(
  manifest: Pick<NiumpiSpriteManifest, "canvas">,
  frame: SpriteFrame,
  targetWidth = manifest.canvas.width,
  targetHeight = manifest.canvas.height,
): { x: number; y: number; width: number; height: number } {
  const scaleX = targetWidth / manifest.canvas.width;
  const scaleY = targetHeight / manifest.canvas.height;
  return {
    x: (frame.offsetX ?? 0) * scaleX,
    y: (frame.offsetY ?? 0) * scaleY,
    width: frame.w * scaleX,
    height: frame.h * scaleY,
  };
}

function validV3Encoding(value: SpriteClipEncoding | undefined, frameCount: number): boolean {
  if (!value || value.format !== "WebP" || value.alpha?.lossless !== true
    || typeof value.rgb?.lossy !== "boolean"
    || value.alpha.meanAbsoluteError !== 0 || value.thresholds?.alphaMAE !== 0
    || value.thresholds.foregroundMAEMax !== NIUMPI_CODEC_MAX_FOREGROUND_MAE
    || value.thresholds.foregroundPSNRMin !== NIUMPI_CODEC_MIN_FOREGROUND_PSNR
    || !Number.isFinite(value.rgb?.foregroundMAE) || value.rgb.foregroundMAE < 0
    || value.rgb.foregroundMAE > value.thresholds.foregroundMAEMax
    || (value.rgb.foregroundPSNR !== null
      && (!Number.isFinite(value.rgb.foregroundPSNR)
        || value.rgb.foregroundPSNR < value.thresholds.foregroundPSNRMin))
    || !Array.isArray(value.selection?.candidateQualities)
    || !Array.isArray(value.selection?.evaluatedQualities)
    || !Array.isArray(value.selection?.candidateProofs)) {
    return false;
  }
  const candidates = value.selection.candidateQualities;
  const evaluated = value.selection.evaluatedQualities;
  const proofs = value.selection.candidateProofs;
  const sameNumbers = (left: readonly number[], right: readonly number[]) => (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
  const validFailureFrames = (frames: readonly number[]) => (
    frames.length > 0
    && frames.every((frame, index) => Number.isInteger(frame) && frame >= 0 && frame < frameCount
      && (index === 0 || frame > frames[index - 1]))
  );
  const metricsPass = (proof: {
    foregroundMAE: number; foregroundPSNR: number | null; alphaMAE: number;
  }) => proof.alphaMAE === value.thresholds.alphaMAE
    && proof.foregroundMAE <= value.thresholds.foregroundMAEMax
    && (proof.foregroundPSNR === null || proof.foregroundPSNR >= value.thresholds.foregroundPSNRMin);
  const sameProof = (
    left: SpriteClipEncoding["selection"]["predecessor"],
    right: SpriteClipEncoding["selection"]["candidateProofs"][number] | null,
  ) => left === null || right === null
    ? left === right
    : left.quality === right.quality
      && left.passes === false && right.passes === false
      && left.foregroundMAE === right.foregroundMAE
      && left.foregroundPSNR === right.foregroundPSNR
      && left.alphaMAE === right.alphaMAE
      && sameNumbers(left.failingFrames, right.failingFrames);
  if (candidates.length === 0 || candidates.at(-1) !== 100
    || candidates.some((quality, index) => !Number.isInteger(quality) || quality < 1 || quality > 100
      || (index > 0 && quality <= candidates[index - 1]))
    || evaluated.length === 0
    || evaluated.some((quality, index) => quality !== candidates[index])
    || proofs.length !== evaluated.length
    || proofs.some((proof, index) => proof.quality !== evaluated[index]
      || typeof proof.passes !== "boolean"
      || !Number.isFinite(proof.foregroundMAE) || proof.foregroundMAE < 0
      || (proof.foregroundPSNR !== null
        && (!Number.isFinite(proof.foregroundPSNR) || proof.foregroundPSNR < 0))
      || !Number.isFinite(proof.alphaMAE) || proof.alphaMAE < 0
      || !Array.isArray(proof.failingFrames)
      || proof.passes !== metricsPass(proof)
      || (proof.passes ? proof.failingFrames.length !== 0 : !validFailureFrames(proof.failingFrames)))) {
    return false;
  }
  const gateFrames = value.frameGate?.frames;
  if (value.frameGate?.foregroundAlpha !== ">0" || value.frameGate.allFramesPassed !== true
    || !Array.isArray(gateFrames) || gateFrames.length !== frameCount
    || gateFrames.some((frame, index) => frame.index !== index || frame.passes !== true
      || frame.alphaMAE !== value.thresholds.alphaMAE
      || !Number.isFinite(frame.foregroundMAE)
      || frame.foregroundMAE < 0 || frame.foregroundMAE > value.thresholds.foregroundMAEMax
      || (frame.foregroundPSNR !== null
        && (!Number.isFinite(frame.foregroundPSNR)
          || frame.foregroundPSNR < value.thresholds.foregroundPSNRMin)))) {
    return false;
  }
  const frameMae = Math.max(...gateFrames.map((frame) => frame.foregroundMAE));
  const finiteFramePsnr = gateFrames.flatMap((frame) => frame.foregroundPSNR === null ? [] : [frame.foregroundPSNR]);
  const framePsnr = finiteFramePsnr.length > 0 ? Math.min(...finiteFramePsnr) : null;
  const frameAlphaMae = Math.max(...gateFrames.map((frame) => frame.alphaMAE));
  if (value.rgb.foregroundMAE !== frameMae || value.rgb.foregroundPSNR !== framePsnr
    || value.alpha.meanAbsoluteError !== frameAlphaMae) {
    return false;
  }
  const predecessor = value.selection.predecessor;
  if (predecessor && (predecessor.passes !== false || !Number.isInteger(predecessor.quality)
    || predecessor.quality < 1 || predecessor.quality > 100
    || !Number.isFinite(predecessor.foregroundMAE) || predecessor.foregroundMAE < 0
    || (predecessor.foregroundPSNR !== null
      && (!Number.isFinite(predecessor.foregroundPSNR) || predecessor.foregroundPSNR < 0))
    || !Number.isFinite(predecessor.alphaMAE) || predecessor.alphaMAE < 0
    || !Array.isArray(predecessor.failingFrames) || predecessor.failingFrames.length === 0)) {
    return false;
  }
  if (value.rgb.lossy) {
    const quality = value.rgb.quality;
    const selectedIndex = candidates.indexOf(quality as number);
    const expectedPredecessor = selectedIndex > 0 ? proofs[selectedIndex - 1] : null;
    const selectedProof = proofs[selectedIndex];
    return value.selection.strategy === "lowest-passing-quality"
      && value.selection.claim === "first-passing-declared-candidate"
      && Number.isInteger(quality) && (quality as number) >= 1 && (quality as number) <= 100
      && value.selection.selectedQuality === quality
      && selectedIndex === evaluated.length - 1
      && selectedProof?.passes === true
      && selectedProof.foregroundMAE === value.rgb.foregroundMAE
      && selectedProof.foregroundPSNR === value.rgb.foregroundPSNR
      && selectedProof.alphaMAE === value.alpha.meanAbsoluteError
      && proofs.slice(0, selectedIndex).every((proof) => proof.passes === false)
      && sameProof(predecessor, expectedPredecessor);
  }
  return value.rgb.quality === null && value.rgb.foregroundPSNR === null
    && value.selection.strategy === "lossless-fallback"
    && value.selection.claim === "declared-candidates-exhausted"
    && value.selection.selectedQuality === null
    && evaluated.length === candidates.length
    && proofs.every((proof) => proof.passes === false)
    && sameProof(predecessor, proofs.at(-1) ?? null);
}

function pageHashMatchesSource(page: SpriteAtlasPage): boolean {
  if (!page.sha256 || !/^[a-f0-9]{64}$/.test(page.sha256)) return false;
  const cleanSource = page.src.split(/[?#]/, 1)[0];
  const match = cleanSource.match(/-([a-f0-9]{12,64})\.webp$/);
  return Boolean(match && page.sha256.startsWith(match[1]));
}

export function validateSpriteManifest(value: unknown): NiumpiSpriteManifest {
  if (!value || typeof value !== "object") throw new Error("Niumpi sprite manifest is not an object");
  const manifest = value as Partial<NiumpiSpriteManifest>;
  if ((manifest.schemaVersion !== 2 && manifest.schemaVersion !== 3)
    || !manifest.canvas || !manifest.anchor || !manifest.clips) {
    throw new Error("Niumpi sprite manifest v2 or v3 is required");
  }
  if (typeof manifest.variant !== "string" || !manifest.variant) throw new Error("Niumpi sprite variant is missing");
  if (manifest.fps !== 24) throw new Error("Niumpi sprite manifest must be authored at 24 FPS");
  if (manifest.canvas.width <= 0 || manifest.canvas.height <= 0) throw new Error("Invalid Niumpi canvas size");
  if (manifest.anchor.x < 0 || manifest.anchor.x > manifest.canvas.width
    || manifest.anchor.y < 0 || manifest.anchor.y > manifest.canvas.height) throw new Error("Invalid Niumpi anchor");
  if (manifest.rigProof && (!Array.isArray(manifest.rigProof.animatedControls)
    || !Array.isArray(manifest.rigProof.animatedChannels) || !Array.isArray(manifest.rigProof.regions))) {
    throw new Error("Invalid top-level Niumpi rig proof");
  }
  if (manifest.schemaVersion === 3 && (!manifest.packing
    || manifest.packing.mode !== "trimmed-rgba-v1"
    || manifest.packing.transparentRGB !== "zero-when-alpha-zero"
    || manifest.packing.sourceCanonicalization?.transparentRGB !== "zero-when-alpha-zero"
    || manifest.packing.sourceCanonicalization.stage !== "pre-encode"
    || manifest.packing.decodedTransparentRGB !== "unspecified-for-lossy-webp"
    || manifest.packing.gutterPx !== 4
    || manifest.packing.maxDecodedPageBytes !== NIUMPI_V3_MAX_DECODED_PAGE_BYTES)) {
    throw new Error("Invalid Niumpi v3 packing contract");
  }
  const requiredClips = spriteClipsForVariant(manifest.variant);
  for (const name of requiredClips) {
    if (!manifest.clips[name]) throw new Error(`Invalid Niumpi clip: ${name}`);
  }
  const clipNames = Object.keys(manifest.clips);
  const unknownClip = clipNames.find((name) => !(NIUMPI_SPRITE_CLIPS as readonly string[]).includes(name));
  if (unknownClip) throw new Error(`Unknown Niumpi clip: ${unknownClip}`);

  for (const name of clipNames as NiumpiSpriteClip[]) {
    const clip = manifest.clips[name];
    if (!clip || clip.name !== name || clip.frameCount !== clip.frames.length || clip.frames.length === 0) {
      throw new Error(`Invalid Niumpi clip: ${name}`);
    }
    const atlasPages = "pages" in clip.atlas ? clip.atlas.pages : [clip.atlas];
    if (clip.fps !== manifest.fps || clip.durationMs <= 0 || atlasPages.length === 0 || !clip.rigProof) throw new Error(`Incomplete Niumpi clip: ${name}`);
    if (atlasPages.some((page) => !page.src || page.width <= 0 || page.height <= 0)
      || ("pages" in clip.atlas && atlasPages.some((page) => page.width > 4096 || page.height > 4096))) {
      throw new Error(`Invalid atlas pages in ${name}`);
    }
    if (manifest.schemaVersion === 3 && (atlasPages.some((page) => (
      !Number.isInteger(page.width) || !Number.isInteger(page.height)
      || page.decodedBytes !== page.width * page.height * 4
      || decodedBytesForAtlasPage(page) > NIUMPI_V3_MAX_DECODED_PAGE_BYTES
      || !pageHashMatchesSource(page)
    )) || !validV3Encoding(clip.encoding, clip.frameCount))) {
      throw new Error(`Invalid v3 atlas integrity in ${name}`);
    }
    if (!Array.isArray(clip.rigProof.animatedControls) || !Array.isArray(clip.rigProof.animatedChannels) || !Array.isArray(clip.rigProof.regions)) {
      throw new Error(`Invalid rig proof in ${name}`);
    }
    if (name === "blink" && (typeof clip.rigProof.blinkClosure !== "number" || clip.rigProof.blinkClosure < 0.8)) {
      throw new Error("Blink clip does not reach 80% eyelid closure");
    }
    if (!Array.isArray(clip.events)) throw new Error(`Invalid events in ${name}`);
    const phases = clip.transition;
    if (!phases || phases.anticipationFrames < 0 || phases.actionFrames < 0 || phases.recoveryFrames < 0
      || phases.anticipationFrames + phases.actionFrames + phases.recoveryFrames !== clip.frameCount) {
      throw new Error(`Invalid transition phases in ${name}`);
    }
    if (isSemanticSpriteClip(name)) {
      const contract = SEMANTIC_CLIP_CONTRACT[name];
      const playback = clip.playback;
      const expectedDuration = contract.frameCount / 24 * 1000;
      if (clip.frameCount !== contract.frameCount || Math.abs(clip.durationMs - expectedDuration) > 1
        || clip.loop !== (name === "sleep")
        || phases.anticipationFrames !== contract.transition.anticipationFrames
        || phases.actionFrames !== contract.transition.actionFrames
        || phases.recoveryFrames !== contract.transition.recoveryFrames) {
        throw new Error(`Semantic motion contract mismatch in ${name}`);
      }
      if (!playback || playback.priority !== contract.playback.priority
        || playback.enterBlendFrames !== contract.playback.enterBlendFrames
        || playback.exitBlendFrames !== contract.playback.exitBlendFrames
        || !Number.isInteger(playback.reducedPoseFrame)
        || playback.reducedPoseFrame < 0 || playback.reducedPoseFrame >= clip.frameCount
        || playback.loopRange?.startFrame !== contract.playback.loopRange?.startFrame
        || playback.loopRange?.endFrameExclusive !== contract.playback.loopRange?.endFrameExclusive
        || playback.exitRange?.startFrame !== contract.playback.exitRange?.startFrame
        || playback.exitRange?.endFrameExclusive !== contract.playback.exitRange?.endFrameExclusive) {
        throw new Error(`Invalid semantic playback in ${name}`);
      }
    }
    const rectangles = new Set<string>();
    let summedDuration = 0;
    for (const [index, frame] of clip.frames.entries()) {
      if (frame.index !== index) throw new Error(`Non-sequential frame index in ${name}`);
      if (frame.w <= 0 || frame.h <= 0 || frame.durationMs <= 0) throw new Error(`Invalid frame in ${name}`);
      const offsetX = frame.offsetX ?? 0;
      const offsetY = frame.offsetY ?? 0;
      const invalidCanvas = manifest.schemaVersion === 2
        ? frame.w !== manifest.canvas.width || frame.h !== manifest.canvas.height
          || frame.offsetX !== undefined || frame.offsetY !== undefined
        : !Number.isInteger(offsetX) || !Number.isInteger(offsetY)
          || offsetX < 0 || offsetY < 0
          || offsetX + frame.w > manifest.canvas.width || offsetY + frame.h > manifest.canvas.height;
      if (invalidCanvas || frame.anchorX !== manifest.anchor.x || frame.anchorY !== manifest.anchor.y) {
        throw new Error(`Unstable canvas or anchor in ${name}`);
      }
      const pageIndex = frame.page ?? 0;
      const page = atlasPages[pageIndex];
      if (!Number.isInteger(pageIndex) || pageIndex < 0 || !page
        || !Number.isInteger(frame.x) || !Number.isInteger(frame.y)
        || !Number.isInteger(frame.w) || !Number.isInteger(frame.h)
        || frame.x < 0 || frame.y < 0 || frame.x + frame.w > page.width || frame.y + frame.h > page.height) {
        throw new Error(`Frame outside atlas in ${name}`);
      }
      const rectangle = `${pageIndex}:${frame.x}:${frame.y}:${frame.w}:${frame.h}`;
      if (rectangles.has(rectangle)) throw new Error(`Repeated atlas rectangle in ${name}`);
      rectangles.add(rectangle);
      summedDuration += frame.durationMs;
    }
    if (Math.abs(summedDuration - clip.durationMs) > 1) throw new Error(`Frame durations do not add up in ${name}`);
    for (const event of clip.events) {
      if (!Number.isInteger(event.frame) || event.frame < 0 || event.frame >= clip.frameCount || !event.type) {
        throw new Error(`Invalid event in ${name}`);
      }
    }
  }
  return manifest as NiumpiSpriteManifest;
}

export function motionGateForClip(name: NiumpiSpriteClip, clip: SpriteClip): "PASS" | "FAIL" {
  const proof = clip.rigProof;
  if (name === "blink") {
    const regions = proof.regions.join(" ").toLowerCase();
    return proof.animatedControls.length >= 2 && (proof.blinkClosure ?? 0) >= 0.8
      && (regions.includes("lid") || regions.includes("eye")) ? "PASS" : "FAIL";
  }
  if (name === "idle") {
    return proof.animatedControls.length >= 4 && proof.animatedChannels.length >= 6 && proof.regions.length >= 4 ? "PASS" : "FAIL";
  }
  if (["tap_reaction", "happy", "eat"].includes(name)) {
    return proof.animatedControls.length >= 6 && proof.animatedChannels.length >= 10 && proof.regions.length >= 6 ? "PASS" : "FAIL";
  }
  return proof.animatedControls.length >= 3 && proof.animatedChannels.length >= 4 && proof.regions.length >= 3 ? "PASS" : "FAIL";
}

export function clipForRigRoot(root: HTMLElement): NiumpiSpriteClip {
  if (root.classList.contains("behavior-eating") || root.classList.contains("behavior-eating-favorite")) return "eat";
  const semantic = root.dataset.anim ?? "idle";
  // Persistent rest wins over a stale blink class left by the CSS controller.
  if (["sleep", "asleep"].includes(semantic)
    || root.classList.contains("behavior-sleep") || root.classList.contains("behavior-asleep")) return "sleep";
  if (["pet", "petting", "tickle"].includes(semantic)
    || root.classList.contains("behavior-petting") || root.classList.contains("behavior-tickle")) return "tap_reaction";
  if (semantic === "happy") return "happy";
  if (["sad", "sleepy"].includes(semantic)) return "sad";
  if (["walk", "hover", "land", "wander", "returning"].includes(semantic)) return "travel";
  if (["read", "book"].includes(semantic)) return "read";
  if (semantic === "lamp") return "lamp";
  if (["dance", "dancing"].includes(semantic)) return "dance";
  if (["sing", "singing"].includes(semantic)) return "sing";
  if (["roll", "spin"].includes(semantic)) return "roll";
  if (["cozy", "sway", "cozy-rest"].includes(semantic)) return "cozy";
  if (["look", "peek", "ponder", "window"].includes(semantic)) {
    const targetGazeX = Number(root.dataset.gazeTargetX);
    if (Number.isFinite(targetGazeX) && Math.abs(targetGazeX) >= 0.5) {
      return targetGazeX < 0 ? "look_left" : "look_right";
    }
    const renderedGazeX = Number.parseFloat(root.style.getPropertyValue("--gaze-x"));
    if (Number.isFinite(renderedGazeX) && Math.abs(renderedGazeX) >= 0.5) {
      return renderedGazeX < 0 ? "look_left" : "look_right";
    }
    // Motion tokens come from the seeded behavior machine. Their parity gives
    // a stable asymmetry when no explicit gaze target exists, without random
    // direction changes during render or MutationObserver churn.
    const token = Number(root.dataset.motionToken ?? 0);
    return Number.isFinite(token) && token % 2 !== 0 ? "look_left" : "look_right";
  }
  // The legacy controller may toggle this class during any presentation. The
  // atlas blink is ambient and only owns an otherwise neutral idle moment.
  if (semantic === "idle" && root.classList.contains("is-blinking")) return "blink";
  return "idle";
}

export type SpriteRootIntent = {
  clip: NiumpiSpriteClip;
  key: string;
  favoriteFeed: boolean;
};

/** Guards async atlas work against a newer semantic request from gameplay. */
export class SpriteIntentGate {
  private key = "";
  private generation = 0;

  begin(key: string): number | null {
    if (key === this.key) return null;
    this.key = key;
    this.generation += 1;
    return this.generation;
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation;
  }
}

export type SpriteSuspensionReason = "viewport" | "document" | "atlas";

export type SpriteSuspensionResume = {
  removed: boolean;
  fullyResumed: boolean;
  shiftMs: number;
};

/**
 * One clock for every reason the Canvas player can stop drawing. Atlas decode
 * is deliberately included: a frame page arriving late must not advance a
 * one-shot through unseen events or recovery poses. Overlapping reasons share
 * the first timestamp, so document + viewport + decode never double-shift.
 */
export class SpritePlaybackSuspension {
  private readonly reasons = new Set<SpriteSuspensionReason>();
  private startedAt: number | null = null;

  suspend(reason: SpriteSuspensionReason, now: number, clockRunning = true): boolean {
    if (this.reasons.has(reason)) return false;
    this.reasons.add(reason);
    if (this.reasons.size === 1 && clockRunning) this.startedAt = now;
    return true;
  }

  resume(reason: SpriteSuspensionReason, now: number): SpriteSuspensionResume {
    if (!this.reasons.delete(reason)) return { removed: false, fullyResumed: false, shiftMs: 0 };
    if (this.reasons.size > 0) return { removed: true, fullyResumed: false, shiftMs: 0 };
    const shiftMs = this.startedAt === null ? 0 : Math.max(0, now - this.startedAt);
    this.startedAt = null;
    return { removed: true, fullyResumed: true, shiftMs };
  }

  get active(): boolean {
    return this.reasons.size > 0;
  }

  activeReasons(): SpriteSuspensionReason[] {
    return [...this.reasons];
  }
}

export type SynthesizedSpriteEvent = {
  type: "prop_detach";
  clip: NiumpiSpriteClip;
  authoredFrame: number;
  observedFrame: number;
  payload?: Record<string, string | number | boolean>;
  spriteToken: number;
};

/**
 * Tracks presentation-only prop ownership across atlas interruptions. Gameplay
 * state is deliberately absent: cleanup can hide a book/blanket, never mutate
 * inventory or rewards.
 */
export class SpritePresentationEventLedger {
  private attached: {
    clip: NiumpiSpriteClip;
    authoredFrame: number;
    observedFrame: number;
    payload?: Record<string, string | number | boolean>;
    spriteToken: number;
  } | null = null;

  observe(event: SpriteEvent, clip: NiumpiSpriteClip, frame: number, spriteToken = -1): void {
    if (event.type === "prop_attach") {
      this.attached = {
        clip,
        authoredFrame: event.frame,
        observedFrame: frame,
        payload: event.payload ? { ...event.payload } : undefined,
        spriteToken,
      };
    }
    if (event.type === "prop_detach" && this.attached?.clip === clip) this.attached = null;
  }

  presentationProp(): string | null {
    const prop = this.attached?.payload?.prop;
    return typeof prop === "string" && prop ? prop : this.attached ? `${this.attached.clip}-prop` : null;
  }

  interrupt(observedFrame?: number): SynthesizedSpriteEvent | null {
    if (!this.attached) return null;
    const cleanup = {
      type: "prop_detach" as const,
      ...this.attached,
      observedFrame: observedFrame ?? this.attached.observedFrame,
    };
    this.attached = null;
    return cleanup;
  }
}

/** A phase-independent key for MutationObserver-driven gameplay requests. */
export function spriteIntentForRigRoot(root: HTMLElement): SpriteRootIntent {
  const clip = clipForRigRoot(root);
  const favoriteFeed = root.classList.contains("behavior-eating-favorite");
  const motionToken = root.dataset.motionToken ?? `state-${root.dataset.anim ?? "idle"}`;
  // The controller's blink class is only an intent while it actually resolves
  // to the blink clip. If it happens during feeding, it must not replay feed.
  const blink = clip === "blink" ? "blink-on" : "no-blink";
  const prop = clip === "eat" ? root.dataset.actionProp ?? "unknown-food" : "no-prop";
  return {
    clip,
    favoriteFeed,
    key: `${motionToken}:${clip}:${favoriteFeed ? "favorite" : "standard"}:${prop}:${blink}`,
  };
}

export function rigAllowsAmbient(root: HTMLElement | null): boolean {
  if (!root) return true;
  const semantic = root.dataset.anim ?? "idle";
  return semantic !== "sleep" && semantic !== "asleep"
    && !root.classList.contains("behavior-sleep")
    && !root.classList.contains("behavior-asleep");
}
