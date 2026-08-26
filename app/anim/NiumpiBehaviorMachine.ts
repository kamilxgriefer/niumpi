import { hashSeed, makeRng } from "../game/rng.ts";

/** Semantic behavior vocabulary. Rendering engines translate this, never own it. */
export type NiumpiBehavior =
  | "idle" | "walk" | "hover" | "land" | "look" | "pet" | "happy" | "sad"
  | "eat" | "eat-favorite" | "sleep" | "dance" | "sing" | "read" | "lamp" | "roll" | "cozy";

export type BehaviorPhase = "anticipation" | "action" | "recovery";
export type BehaviorSource = "autonomous" | "user" | "system";
export type BehaviorMood = "calm" | "happy" | "excited" | "curious" | "tired" | "sad" | "sleeping";

export type BehaviorContext = {
  mood: BehaviorMood;
  /** Normalised drives; callers can pass raw values and they will be clamped. */
  energy: number;
  joy: number;
  curiosity: number;
  playfulness: number;
};

type BehaviorDefinition = {
  priority: number;
  phases: Record<BehaviorPhase, number | null>;
  next?: NiumpiBehavior;
};

const DEFINITIONS: Record<NiumpiBehavior, BehaviorDefinition> = {
  idle: { priority: 0, phases: { anticipation: 0, action: null, recovery: 0 } },
  // Walk/hover/land are scene meanings for one complete authored travel clip.
  walk: { priority: 1, phases: { anticipation: 1_000 / 3, action: 2_000, recovery: 2_000 / 3 } },
  hover: { priority: 1, phases: { anticipation: 1_000 / 3, action: 2_000, recovery: 2_000 / 3 } },
  land: { priority: 1, phases: { anticipation: 1_000 / 3, action: 2_000, recovery: 2_000 / 3 } },
  // A curious glance is a small performance: eyes lead, the body follows,
  // then the pose settles. The authored 12-frame clip needs room to breathe.
  look: { priority: 1, phases: { anticipation: 180, action: 1800, recovery: 320 } },
  pet: { priority: 4, phases: { anticipation: 150, action: 1_400, recovery: 300 } },
  happy: { priority: 2, phases: { anticipation: 100, action: 1_000, recovery: 300 } },
  sad: { priority: 3, phases: { anticipation: 250, action: 1_250, recovery: 500 } },
  eat: { priority: 4, phases: { anticipation: 450, action: 2_150, recovery: 400 } },
  "eat-favorite": { priority: 4, phases: { anticipation: 450, action: 3_050, recovery: 500 } },
  sleep: { priority: 5, phases: { anticipation: 2_000 / 3, action: null, recovery: 2_000 / 3 } },
  dance: { priority: 2, phases: { anticipation: 1_000 / 3, action: 13_000 / 6, recovery: 500 } },
  sing: { priority: 2, phases: { anticipation: 1_000 / 3, action: 3_000, recovery: 2_000 / 3 } },
  read: { priority: 2, phases: { anticipation: 500, action: 7_000 / 3, recovery: 2_000 / 3 } },
  lamp: { priority: 2, phases: { anticipation: 1_000 / 3, action: 1_000, recovery: 2_000 / 3 } },
  roll: { priority: 2, phases: { anticipation: 1_000 / 3, action: 1_500, recovery: 2_000 / 3 } },
  cozy: { priority: 3, phases: { anticipation: 500, action: 5_500 / 3, recovery: 2_000 / 3 } },
};

export const behaviorDefinitions: Readonly<Record<NiumpiBehavior, BehaviorDefinition>> = DEFINITIONS;

const AUTONOMOUS_ORDER: NiumpiBehavior[] = [
  "idle", "walk", "hover", "look", "happy", "sad", "dance", "sing", "read", "lamp", "roll", "sleep",
];

const HIGH_MOTION = new Set<NiumpiBehavior>(["walk", "hover", "land", "dance", "roll"]);
const SOURCE_RANK: Record<BehaviorSource, number> = { autonomous: 0, user: 1, system: 2 };
const DEFAULT_CONTEXT: BehaviorContext = {
  mood: "calm", energy: 0.72, joy: 0.72, curiosity: 0.5, playfulness: 0.45,
};

function unit(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function normaliseContext(context: Partial<BehaviorContext>): BehaviorContext {
  return {
    mood: context.mood ?? DEFAULT_CONTEXT.mood,
    energy: unit(context.energy ?? DEFAULT_CONTEXT.energy, DEFAULT_CONTEXT.energy),
    joy: unit(context.joy ?? DEFAULT_CONTEXT.joy, DEFAULT_CONTEXT.joy),
    curiosity: unit(context.curiosity ?? DEFAULT_CONTEXT.curiosity, DEFAULT_CONTEXT.curiosity),
    playfulness: unit(context.playfulness ?? DEFAULT_CONTEXT.playfulness, DEFAULT_CONTEXT.playfulness),
  };
}

/** Mood shapes probability, while needs keep energetic choices believable. */
export function idleWeightsFor(
  rawContext: Partial<BehaviorContext>,
  reducedMotion = false,
): Record<NiumpiBehavior, number> {
  const context = normaliseContext(rawContext);
  const weights: Record<NiumpiBehavior, number> = {
    idle: 1.5,
    walk: 1.05 * (0.18 + context.energy * 0.82),
    hover: 0.65 * (0.12 + context.energy * 0.88),
    land: 0,
    look: 1.15 + context.curiosity * 1.2,
    pet: 0,
    happy: 0.5 + context.joy * 0.8,
    sad: Math.max(0, (0.48 - context.joy) * 3),
    eat: 0,
    "eat-favorite": 0,
    sleep: 0,
    dance: 0.2 + context.playfulness * context.energy * 1.4,
    sing: 0.3 + context.joy * 0.55,
    read: 0.55 + context.curiosity * 0.9,
    lamp: 0.45,
    roll: 0.12 + context.playfulness * context.energy * 1.2,
    cozy: 0,
  };

  if (context.mood === "excited") {
    weights.dance *= 3.2; weights.roll *= 2.8; weights.hover *= 1.8; weights.happy *= 2.1;
  } else if (context.mood === "happy") {
    weights.happy *= 1.8; weights.sing *= 1.45; weights.walk *= 1.25;
  } else if (context.mood === "curious") {
    weights.look *= 2.4; weights.read *= 2.2; weights.hover *= 1.35;
  } else if (context.mood === "tired") {
    weights.read *= 1.6; weights.lamp *= 2.1; weights.sad += 0.7;
    weights.walk *= 0.18; weights.hover *= 0.08; weights.dance *= 0.05; weights.roll *= 0.04;
  } else if (context.mood === "sad") {
    weights.sad += 3.4; weights.lamp *= 2.8; weights.read *= 1.5; weights.look *= 1.4;
    weights.happy *= 0.08; weights.walk *= 0.12; weights.hover *= 0.04; weights.dance *= 0.02; weights.roll *= 0.01;
  } else if (context.mood === "sleeping") {
    for (const state of AUTONOMOUS_ORDER) weights[state] = state === "sleep" ? 1 : 0;
  }

  if (reducedMotion) {
    for (const state of HIGH_MOTION) weights[state] = 0;
  }
  return weights;
}

export type BehaviorSnapshot = {
  state: NiumpiBehavior;
  phase: BehaviorPhase;
  source: BehaviorSource;
  priority: number;
  token: number;
  enteredAt: number;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  nextIdleAt: number | null;
  reducedMotion: boolean;
  /** Renderers use this to retain meaning without moving the character. */
  motionScale: 0 | 1;
};

export type BehaviorRequest = {
  source?: BehaviorSource;
  /** System transitions such as waking may deliberately bypass priority. */
  force?: boolean;
};

export type BehaviorRequestResult = {
  accepted: boolean;
  snapshot: BehaviorSnapshot;
  cancelledToken?: number;
  reason?: "lower-priority" | "already-active" | "stale-token" | "idle";
};

export type BehaviorMachineOptions = {
  seed: string | number;
  now?: number;
  context?: Partial<BehaviorContext>;
  reducedMotion?: boolean;
  idleDelay?: readonly [number, number];
};

type ActiveBehavior = Omit<BehaviorSnapshot, "nextIdleAt" | "reducedMotion" | "motionScale">;

const PHASE_ORDER: BehaviorPhase[] = ["anticipation", "action", "recovery"];
const MAX_TRANSITIONS_PER_ADVANCE = 128;

/**
 * A renderer-agnostic, clock-driven behavior machine. It never starts timers,
 * touches the DOM or samples ambient randomness, so a session can be replayed.
 */
export class NiumpiBehaviorMachine {
  private readonly seed: string | number;
  private readonly idleDelay: readonly [number, number];
  private context: BehaviorContext;
  private reduced: boolean;
  private active: ActiveBehavior;
  private nextIdleAt: number | null = null;
  private idleCycle = 0;
  private previousIdle: NiumpiBehavior | null = null;
  private token = 0;
  private lastNow: number;

  constructor(options: BehaviorMachineOptions) {
    const now = Number.isFinite(options.now) ? options.now! : 0;
    this.seed = options.seed;
    this.idleDelay = options.idleDelay ?? [6_000, 14_000];
    this.context = normaliseContext(options.context ?? {});
    this.reduced = Boolean(options.reducedMotion);
    this.lastNow = now;
    this.active = this.makeActive("idle", "system", now);
    this.scheduleIdle(now);
    if (this.context.mood === "sleeping") this.start("sleep", "system", now);
  }

  getSnapshot(): BehaviorSnapshot {
    return {
      ...this.active,
      nextIdleAt: this.nextIdleAt,
      reducedMotion: this.reduced,
      motionScale: this.reduced ? 0 : 1,
    };
  }

  getContext(): BehaviorContext {
    return { ...this.context };
  }

  request(state: NiumpiBehavior, now: number, options: BehaviorRequest = {}): BehaviorRequestResult {
    this.advance(now);
    const at = this.lastNow;
    const source = options.source ?? "user";
    if (!options.force && state === this.active.state && this.active.phase !== "recovery") {
      return { accepted: false, snapshot: this.getSnapshot(), reason: "already-active" };
    }
    const incoming = DEFINITIONS[state];
    const current = DEFINITIONS[this.active.state];
    const outranks = incoming.priority > current.priority
      || (incoming.priority === current.priority && SOURCE_RANK[source] >= SOURCE_RANK[this.active.source]);
    if (!options.force && !outranks) {
      return { accepted: false, snapshot: this.getSnapshot(), reason: "lower-priority" };
    }
    const cancelledToken = this.active.state === "idle" ? undefined : this.active.token;
    this.start(state, source, at);
    return { accepted: true, snapshot: this.getSnapshot(), cancelledToken };
  }

  /** Token-aware cancellation prevents a stale UI callback stopping a newer action. */
  cancel(now: number, token = this.active.token): BehaviorRequestResult {
    this.advance(now);
    const at = this.lastNow;
    if (token !== this.active.token) {
      return { accepted: false, snapshot: this.getSnapshot(), reason: "stale-token" };
    }
    if (this.active.state === "idle") {
      return { accepted: false, snapshot: this.getSnapshot(), reason: "idle" };
    }
    const cancelledToken = this.active.token;
    const recovery = this.durationFor(this.active.state, "recovery");
    if (recovery > 0) {
      this.active = {
        ...this.active,
        phase: "recovery",
        phaseStartedAt: at,
        phaseEndsAt: at + recovery,
      };
      this.nextIdleAt = null;
    } else {
      this.startIdle(at);
    }
    return { accepted: true, snapshot: this.getSnapshot(), cancelledToken };
  }

  setContext(next: Partial<BehaviorContext>, now: number): BehaviorSnapshot {
    this.advance(now);
    const at = this.lastNow;
    const previousMood = this.context.mood;
    this.context = normaliseContext({ ...this.context, ...next });
    if (this.context.mood === "sleeping" && this.active.state !== "sleep") {
      this.start("sleep", "system", at);
    } else if (previousMood === "sleeping" && this.context.mood !== "sleeping" && this.active.state === "sleep") {
      this.cancel(at, this.active.token);
    }
    return this.getSnapshot();
  }

  setReducedMotion(reduced: boolean, now: number): BehaviorSnapshot {
    this.advance(now);
    const at = this.lastNow;
    if (this.reduced === reduced) return this.getSnapshot();
    this.reduced = reduced;
    if (reduced && this.active.source === "autonomous" && HIGH_MOTION.has(this.active.state)) {
      this.startIdle(at);
      return this.getSnapshot();
    }
    if (reduced && this.active.phaseEndsAt !== null) {
      const remaining = Math.max(0, this.active.phaseEndsAt - at);
      this.active.phaseEndsAt = at + Math.min(remaining, this.durationFor(this.active.state, this.active.phase));
    }
    return this.getSnapshot();
  }

  /**
   * Retimes an active behavior whose presentation atlas resumed before that
   * behavior ended. The sampling cursor (`lastNow`) remains wall-clock based;
   * only the authored phase boundaries move forward with the sprite clock.
   */
  shiftClock(deltaMs: number): BehaviorSnapshot {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return this.getSnapshot();
    this.active = {
      ...this.active,
      enteredAt: this.active.enteredAt + deltaMs,
      phaseStartedAt: this.active.phaseStartedAt + deltaMs,
      phaseEndsAt: this.active.phaseEndsAt === null ? null : this.active.phaseEndsAt + deltaMs,
    };
    if (this.nextIdleAt !== null) this.nextIdleAt += deltaMs;
    return this.getSnapshot();
  }

  /** Advances phases and starts due autonomous behavior. Time never moves backwards. */
  advance(now: number): BehaviorSnapshot {
    const target = Math.max(this.lastNow, Number.isFinite(now) ? now : this.lastNow);
    this.lastNow = target;
    let transitions = 0;
    while (transitions < MAX_TRANSITIONS_PER_ADVANCE) {
      transitions += 1;
      if (this.active.phaseEndsAt !== null && this.active.phaseEndsAt <= target) {
        this.completePhase(this.active.phaseEndsAt);
        continue;
      }
      if (this.active.state === "idle" && this.nextIdleAt !== null && this.nextIdleAt <= target) {
        const scheduledAt = this.nextIdleAt;
        const choice = this.chooseIdle();
        if (choice === "idle") this.startIdle(scheduledAt);
        else this.start(choice, "autonomous", scheduledAt);
        continue;
      }
      break;
    }
    // A tab can return after days. Animation history has no gameplay value, so
    // cap catch-up work and resume from a fresh deterministic idle boundary.
    if (transitions >= MAX_TRANSITIONS_PER_ADVANCE) this.startIdle(target);
    return this.getSnapshot();
  }

  private makeActive(state: NiumpiBehavior, source: BehaviorSource, now: number): ActiveBehavior {
    const phase = this.firstPhase(state);
    const duration = this.durationFor(state, phase);
    return {
      state,
      phase,
      source,
      priority: DEFINITIONS[state].priority,
      token: ++this.token,
      enteredAt: now,
      phaseStartedAt: now,
      phaseEndsAt: duration === Infinity ? null : now + duration,
    };
  }

  private start(state: NiumpiBehavior, source: BehaviorSource, now: number) {
    this.active = this.makeActive(state, source, now);
    this.nextIdleAt = null;
  }

  private startIdle(now: number) {
    this.active = this.makeActive("idle", "system", now);
    this.scheduleIdle(now);
  }

  private firstPhase(state: NiumpiBehavior): BehaviorPhase {
    return this.durationFor(state, "anticipation") > 0 ? "anticipation" : "action";
  }

  private durationFor(state: NiumpiBehavior, phase: BehaviorPhase): number {
    const duration = DEFINITIONS[state].phases[phase];
    if (duration === null) return Infinity;
    if (!this.reduced) return duration;
    // Keep the semantic reaction visible, but remove travel and long loops.
    return phase === "action" ? Math.min(duration, 320) : Math.min(duration, 80);
  }

  private completePhase(at: number) {
    const index = PHASE_ORDER.indexOf(this.active.phase);
    for (let nextIndex = index + 1; nextIndex < PHASE_ORDER.length; nextIndex += 1) {
      const phase = PHASE_ORDER[nextIndex];
      const duration = this.durationFor(this.active.state, phase);
      if (duration <= 0) continue;
      this.active = {
        ...this.active,
        phase,
        phaseStartedAt: at,
        phaseEndsAt: duration === Infinity ? null : at + duration,
      };
      return;
    }
    const chained = DEFINITIONS[this.active.state].next;
    if (chained) this.start(chained, this.active.source, at);
    else this.startIdle(at);
  }

  private scheduleIdle(from: number) {
    if (this.context.mood === "sleeping") {
      this.nextIdleAt = from;
      return;
    }
    const rawMin = Number.isFinite(this.idleDelay[0]) ? this.idleDelay[0] : 6_000;
    const rawMax = Number.isFinite(this.idleDelay[1]) ? this.idleDelay[1] : 14_000;
    const min = Math.max(0, Math.min(rawMin, rawMax));
    const max = Math.max(min, Math.max(rawMin, rawMax));
    const roll = this.sample("delay", this.idleCycle);
    this.nextIdleAt = from + Math.round(min + (max - min) * roll);
  }

  private chooseIdle(): NiumpiBehavior {
    const weights = idleWeightsFor(this.context, this.reduced);
    if (this.previousIdle) weights[this.previousIdle] = 0;
    const total = AUTONOMOUS_ORDER.reduce((sum, state) => sum + Math.max(0, weights[state]), 0);
    let cursor = this.sample("choice", this.idleCycle) * Math.max(1, total);
    let selected: NiumpiBehavior = "idle";
    for (const state of AUTONOMOUS_ORDER) {
      cursor -= Math.max(0, weights[state]);
      if (cursor <= 0) { selected = state; break; }
    }
    this.previousIdle = selected;
    this.idleCycle += 1;
    return selected;
  }

  private sample(kind: "delay" | "choice", cycle: number): number {
    return makeRng(hashSeed(this.seed, cycle, kind, "niumpi-behavior-v1"))();
  }
}
