import { onMotionChange, prefersReducedMotion } from "./motionPrefs.ts";
import {
  NiumpiBehaviorMachine,
  type BehaviorContext,
  type BehaviorSnapshot,
} from "./NiumpiBehaviorMachine.ts";
import {
  legacyAnimationForBehavior,
  semanticBehaviorForLegacy,
} from "./legacyBehaviorAdapter.ts";
import {
  NIUMPI_SPRITE_CLOCK_RESUME_EVENT,
  type SpriteClockResumeDetail,
} from "./NiumpiSpriteRuntime.ts";

/** Compatibility vocabulary used by game rules and scenes. */
export type AnimState =
  | "idle" | "wander" | "float" | "spin" | "curious" | "happy" | "sleepy" | "asleep"
  | "peek" | "sway" | "cozy-rest" | "shimmy" | "stretch" | "ponder"
  | "book" | "window" | "lamp" | "roll" | "singing"
  | "eating" | "eating-favorite" | "hugging" | "petting" | "tickle" | "brushing" | "dancing"
  | "waking" | "hatching" | "evolving" | "gift" | "cooking" | "gardening" | "playing" | "returning";

const POSITION_STIFFNESS = 0.028;
const POSITION_DAMPING = 0.84;
const GAZE_STIFFNESS = 0.09;
const GAZE_DAMPING = 0.72;

type Options = {
  onStateChange?: (state: AnimState) => void;
  seed?: string | number;
};

/**
 * One motion director owns behavior phases, locomotion springs, gaze and
 * presentation classes. React only sends intentions; no animation frame is
 * stored in React state.
 */
export class NiumpiAnimationController {
  private root: HTMLElement | null = null;
  private frame = 0;
  private blinkTimer: number | undefined;
  private unsubscribeMotion: (() => void) | null = null;
  private machine: NiumpiBehaviorMachine | null = null;
  private presentation: AnimState = "idle";
  private restState: AnimState = "idle";
  private reduced = false;
  private context: Partial<BehaviorContext> = {};
  private readonly options: Options;
  private listeners = new Set<(state: AnimState) => void>();
  private lastSnapshotKey = "";

  private target = { x: 0, y: 0, gazeX: 0, gazeY: 0 };
  private value = { x: 0, y: 0, vx: 0, vy: 0, gazeX: 0, gazeY: 0, vgx: 0, vgy: 0 };
  private restPosition = { x: 0, y: 0 };

  private readonly handleSpriteClockResume = (event: Event) => {
    if (!(event instanceof CustomEvent) || !this.machine) return;
    const detail = (event as CustomEvent<SpriteClockResumeDetail>).detail;
    const current = this.machine.getSnapshot();
    if (!detail || detail.motionToken !== String(current.token) || current.state === "idle") return;
    const shiftMs = Number(detail.shiftMs);
    const snapshot = this.machine.shiftClock(Number.isFinite(shiftMs) ? Math.max(0, shiftMs) : 0);
    if (snapshot) this.applySnapshot(snapshot, true);
  };

  constructor(options: Options = {}) {
    this.options = options;
  }

  attach(root: HTMLElement) {
    if (this.root === root) return;
    this.root = root;
    root.addEventListener(NIUMPI_SPRITE_CLOCK_RESUME_EVENT, this.handleSpriteClockResume);
    this.reduced = prefersReducedMotion();
    const now = this.now();
    this.machine = new NiumpiBehaviorMachine({
      seed: this.options.seed ?? "niumpi-motion-v2",
      now,
      context: {
        ...this.context,
        mood: this.restState === "asleep" ? "sleeping" : this.context.mood,
      },
      reducedMotion: this.reduced,
    });
    this.presentation = this.restState;
    this.lastSnapshotKey = "";
    this.applySnapshot(this.machine.getSnapshot());
    this.startLoop();
    this.scheduleBlink();
    this.unsubscribeMotion = onMotionChange((reduced) => {
      this.reduced = reduced;
      const snapshot = this.machine?.setReducedMotion(reduced, this.now());
      if (snapshot) this.applySnapshot(snapshot);
      this.root?.classList.toggle("is-reduced", reduced);
      if (reduced) this.snap();
    });
    root.classList.toggle("is-reduced", this.reduced);
  }

  detach() {
    if (this.frame) window.cancelAnimationFrame(this.frame);
    window.clearTimeout(this.blinkTimer);
    this.unsubscribeMotion?.();
    this.unsubscribeMotion = null;
    this.root?.removeEventListener(NIUMPI_SPRITE_CLOCK_RESUME_EVENT, this.handleSpriteClockResume);
    this.frame = 0;
    this.root = null;
    this.machine = null;
    this.lastSnapshotKey = "";
  }

  /** Ask for an authored reaction. The semantic machine decides interruption. */
  request(next: AnimState) {
    const machine = this.machine;
    if (!machine) {
      this.presentation = next;
      return;
    }
    let result = machine.request(semanticBehaviorForLegacy(next), this.now(), { source: "user" });
    // Two rich performances can share one semantic state. Feeding while an
    // autonomous happy moment is active must still restart as the explicit
    // eating performance, rather than silently keeping the generic bounce.
    if (!result.accepted && result.reason === "already-active") {
      result = machine.request(semanticBehaviorForLegacy(next), this.now(), { source: "user", force: true });
    }
    if (!result.accepted) return;
    this.presentation = next;
    this.applySnapshot(result.snapshot, true);
  }

  /** The relationship model shapes autonomous motion without choosing frames. */
  setBehaviorContext(next: Partial<BehaviorContext>) {
    this.context = { ...this.context, ...next };
    const snapshot = this.machine?.setContext(this.context, this.now());
    if (snapshot) this.applySnapshot(snapshot);
  }

  /** Resting state the creature returns to after an authored reaction. */
  setRest(state: AnimState) {
    this.restState = state;
    this.context = {
      ...this.context,
      mood: state === "asleep"
        ? "sleeping"
        : this.context.mood === "sleeping" ? "calm" : this.context.mood,
    };
    const snapshot = this.machine?.setContext(this.context, this.now());
    if (!snapshot) return;
    this.presentation = state === "asleep" ? "asleep" : legacyAnimationForBehavior(snapshot.state);
    this.applySnapshot(snapshot, true);
  }

  setPosition(x: number, y: number) {
    this.target.x = x;
    this.target.y = y;
    if (this.reduced) this.snap();
  }

  /** Scene-owned anchor used when an authored reaction settles back to idle. */
  setRestPosition(x: number, y: number, moveNow = false) {
    this.restPosition = { x, y };
    if (moveNow) this.setPosition(x, y);
  }

  returnToRestPosition() {
    this.setPosition(this.restPosition.x, this.restPosition.y);
    this.setGaze(0, 0);
  }

  /**
   * Scene-owned locomotion target. The behavior machine still owns the travel
   * phases; these data markers make the selected destination and actual spring
   * translation inspectable without leaking room state into animation state.
   */
  setTravelDestination(destination: string, x: number, y: number) {
    if (this.root) {
      this.root.dataset.travelDestination = destination;
      this.root.dataset.travelOriginX = this.value.x.toFixed(2);
      this.root.dataset.travelOriginY = this.value.y.toFixed(2);
      this.root.dataset.travelDestinationX = String(x);
      this.root.dataset.travelDestinationY = String(y);
      this.root.dataset.travelTranslationSuppressed = String(this.reduced);
    }
    if (this.reduced) {
      // The room still changes and the semantic travel pose still plays, but
      // reduced motion never translates the whole creature across the scene.
      this.restPosition = { x: 0, y: 0 };
      this.setPosition(0, 0);
      this.setGaze(0, 0);
    } else {
      this.restPosition = { x, y };
      this.setPosition(x, y);
      this.setGaze(Math.sign(x - this.value.x) * 10, y < this.value.y ? -3 : 0);
    }
  }

  setGaze(x: number, y: number) {
    this.target.gazeX = x;
    this.target.gazeY = y;
    if (this.root) {
      this.root.dataset.gazeTargetX = String(x);
      this.root.dataset.gazeTargetY = String(y);
    }
    if (this.reduced) this.snap();
  }

  setPressed(pressed: boolean) { this.root?.classList.toggle("is-pressed", pressed); }
  setTargeted(targeted: boolean) { this.root?.classList.toggle("is-target", targeted); }
  setActionProp(prop: string) {
    if (this.root) this.root.dataset.actionProp = prop;
  }
  getState(): AnimState { return this.presentation; }

  subscribeState(listener: (state: AnimState) => void) {
    this.listeners.add(listener);
    listener(this.presentation);
    return () => { this.listeners.delete(listener); };
  }

  private now(): number {
    return typeof performance === "undefined" ? 0 : performance.now();
  }

  private applySnapshot(snapshot: BehaviorSnapshot, force = false) {
    const root = this.root;
    if (!root) return;
    const key = `${snapshot.token}:${snapshot.state}:${snapshot.phase}:${snapshot.motionScale}`;
    if (!force && key === this.lastSnapshotKey) return;
    this.lastSnapshotKey = key;

    // Autonomous clips choose a compatible presentation. Explicit scene
    // requests keep their richer names (book/window/tickle etc.).
    if (snapshot.source === "autonomous" || snapshot.state === "idle") {
      this.presentation = legacyAnimationForBehavior(snapshot.state);
    }
    if (snapshot.state === "sleep") this.presentation = "asleep";

    // Autonomous travel chooses a quiet destination from the behavior token.
    // The spring performs the journey; no scene interval competes with it.
    if (snapshot.source === "autonomous" && snapshot.phase === "anticipation") {
      const direction = snapshot.token % 2 === 0 ? 1 : -1;
      if (snapshot.state === "walk") {
        this.setPosition(direction * (48 + (snapshot.token % 3) * 12), 3);
        this.setGaze(direction * 9, 1);
      } else if (snapshot.state === "hover") {
        this.setPosition(direction * 28, -28);
        this.setGaze(direction * 7, -5);
      } else if (snapshot.state === "look") {
        this.setGaze(direction * 12, snapshot.token % 3 === 0 ? -6 : 1);
      }
    }

    root.dataset.anim = snapshot.state;
    root.dataset.phase = snapshot.phase;
    root.dataset.motionToken = String(snapshot.token);
    root.dataset.motionEnteredAt = snapshot.enteredAt.toFixed(3);
    root.dataset.phaseStartedAt = snapshot.phaseStartedAt.toFixed(3);
    root.dataset.phaseEndsAt = snapshot.phaseEndsAt === null ? "none" : snapshot.phaseEndsAt.toFixed(3);
    root.className = root.className
      .replace(/\bbehavior-[\w-]+/g, "")
      .replace(/\bphase-[\w-]+/g, "")
      .trim();
    root.classList.add(
      `behavior-${this.presentation}`,
      `behavior-semantic-${snapshot.state}`,
      `phase-${snapshot.phase}`,
    );
    this.options.onStateChange?.(this.presentation);
    this.listeners.forEach((listener) => listener(this.presentation));
  }

  private startLoop() {
    if (this.frame) return;
    const step = () => {
      this.tick();
      this.frame = window.requestAnimationFrame(step);
    };
    this.frame = window.requestAnimationFrame(step);
  }

  private tick() {
    const root = this.root;
    if (!root) return;
    const snapshot = this.machine?.advance(this.now());
    if (snapshot) this.applySnapshot(snapshot);

    const value = this.value;
    const target = this.target;
    if (this.reduced) {
      value.x = target.x; value.y = target.y;
      value.gazeX = target.gazeX; value.gazeY = target.gazeY;
    } else {
      value.vx = (value.vx + (target.x - value.x) * POSITION_STIFFNESS) * POSITION_DAMPING;
      value.vy = (value.vy + (target.y - value.y) * POSITION_STIFFNESS) * POSITION_DAMPING;
      value.vgx = (value.vgx + (target.gazeX - value.gazeX) * GAZE_STIFFNESS) * GAZE_DAMPING;
      value.vgy = (value.vgy + (target.gazeY - value.gazeY) * GAZE_STIFFNESS) * GAZE_DAMPING;
      value.x += value.vx; value.y += value.vy;
      value.gazeX += value.vgx; value.gazeY += value.vgy;
    }

    const style = root.style;
    style.setProperty("--rig-x", `${value.x.toFixed(2)}px`);
    style.setProperty("--rig-y", `${value.y.toFixed(2)}px`);
    style.setProperty("--gaze-x", `${value.gazeX.toFixed(2)}px`);
    style.setProperty("--gaze-y", `${value.gazeY.toFixed(2)}px`);
    // A tiny head lean follows attention; the whole creature never spins with gaze.
    style.setProperty("--gaze-tilt", `${(value.gazeX * 0.045).toFixed(2)}deg`);
  }

  private snap() {
    this.value.x = this.target.x; this.value.y = this.target.y;
    this.value.gazeX = this.target.gazeX; this.value.gazeY = this.target.gazeY;
    this.value.vx = 0; this.value.vy = 0; this.value.vgx = 0; this.value.vgy = 0;
  }

  private scheduleBlink() {
    const run = () => {
      this.blinkTimer = window.setTimeout(() => {
        if (this.reduced || this.presentation === "asleep") { run(); return; }
        this.root?.classList.add("is-blinking");
        this.blinkTimer = window.setTimeout(() => {
          this.root?.classList.remove("is-blinking");
          run();
        }, 135);
      }, 2_100 + Math.random() * 3_400);
    };
    run();
  }
}
