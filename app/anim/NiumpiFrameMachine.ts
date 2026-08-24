export type FrameState = "ENTERING" | "IDLE" | "BLINKING" | "LOOKING" | "REACTING" | "HAPPY";
export type FrameClip = "hatch_complete" | "idle" | "blink" | "look" | "tap_reaction" | "happy";

export type AtlasFrame = {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  durationMs: number;
};

export type AtlasClip = {
  fps: number;
  loop: boolean;
  frameCount: number;
  durationMs: number;
  frames: AtlasFrame[];
};

export type FrameManifest = {
  version: number;
  renderer: string;
  frameSize: { width: number; height: number };
  columns: number;
  fps: number;
  totalFramesPerVariant: number;
  clips: Record<FrameClip, AtlasClip>;
  variants: Record<string, {
    atlas: string;
    width: number;
    height: number;
    sourcePoseSheet: string;
  }>;
};

const PRIORITY: Record<FrameState, number> = {
  IDLE: 0,
  BLINKING: 1,
  LOOKING: 2,
  HAPPY: 3,
  REACTING: 4,
  ENTERING: 5,
};

export const CLIP_FOR_STATE: Record<FrameState, FrameClip> = {
  ENTERING: "hatch_complete",
  IDLE: "idle",
  BLINKING: "blink",
  LOOKING: "look",
  REACTING: "tap_reaction",
  HAPPY: "happy",
};

export type FrameMachineSnapshot = {
  state: FrameState;
  clip: FrameClip;
  enteredAt: number;
  token: number;
};

/**
 * Playback-only FSM. Gameplay owns meaning; this machine only prevents a blink
 * or idle loop from cutting through a touch, happiness or hatch performance.
 */
export class NiumpiFrameMachine {
  private state: FrameState;
  private enteredAt: number;
  private token = 1;
  private durations: Record<FrameClip, number>;

  constructor(initial: FrameState, now: number, durations: Record<FrameClip, number>) {
    this.state = initial;
    this.enteredAt = now;
    this.durations = durations;
  }

  snapshot(): FrameMachineSnapshot {
    return { state: this.state, clip: CLIP_FOR_STATE[this.state], enteredAt: this.enteredAt, token: this.token };
  }

  request(next: FrameState, now: number, force = false): { accepted: boolean; snapshot: FrameMachineSnapshot } {
    this.advance(now);
    if (next === this.state) return { accepted: false, snapshot: this.snapshot() };
    if (!force && PRIORITY[next] < PRIORITY[this.state]) return { accepted: false, snapshot: this.snapshot() };
    this.state = next;
    this.enteredAt = now;
    this.token += 1;
    return { accepted: true, snapshot: this.snapshot() };
  }

  advance(now: number): FrameMachineSnapshot {
    if (this.state === "IDLE") return this.snapshot();
    const clip = CLIP_FOR_STATE[this.state];
    if (now - this.enteredAt >= this.durations[clip]) {
      this.state = "IDLE";
      this.enteredAt = now;
      this.token += 1;
    }
    return this.snapshot();
  }
}

export function frameIndexAtTime(clip: AtlasClip, elapsedMs: number): number {
  if (clip.frames.length === 0) return 0;
  const safeElapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  const local = clip.loop
    ? safeElapsed % clip.durationMs
    : Math.min(safeElapsed, Math.max(0, clip.durationMs - 0.0001));
  let cursor = 0;
  for (let index = 0; index < clip.frames.length; index += 1) {
    cursor += clip.frames[index].durationMs;
    if (local < cursor) return index;
  }
  return clip.frames.length - 1;
}

export function variantFor(stage: number, morphology: string): string {
  if (stage >= 5 && morphology !== "seedling") return morphology;
  return `stage-${Math.max(1, Math.min(5, Math.round(stage)))}`;
}

export function frameStateForRoot(root: HTMLElement): FrameState {
  if (root.classList.contains("is-blinking")) return "BLINKING";
  const semantic = root.dataset.anim ?? "idle";
  if (semantic === "pet" || root.classList.contains("behavior-petting") || root.classList.contains("behavior-tickle")) return "REACTING";
  if (["happy", "dance", "sing", "roll"].includes(semantic)) return "HAPPY";
  if (semantic === "look" || root.classList.contains("behavior-peek") || root.classList.contains("behavior-ponder")) return "LOOKING";
  return "IDLE";
}
