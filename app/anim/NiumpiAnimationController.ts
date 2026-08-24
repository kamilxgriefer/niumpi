import { onMotionChange, prefersReducedMotion } from "./motionPrefs.ts";

/**
 * The character's animation controller.
 *
 * No Rive asset ships with this repo, so the creature is composable SVG/CSS
 * layers driven from here instead. This class owns the single rAF loop, the
 * state machine and every per-frame value. React only ever states an intent
 * ("be happy now") — it is never told about frames, and no animation value
 * passes through React state or a re-render.
 */

export type AnimState =
  | "idle" | "wander" | "float" | "spin" | "curious" | "happy" | "sleepy" | "asleep"
  | "peek" | "sway" | "shimmy" | "stretch" | "ponder"
  | "book" | "window" | "lamp" | "roll" | "singing"
  | "eating" | "hugging" | "petting" | "tickle" | "brushing" | "dancing"
  | "waking" | "hatching" | "evolving" | "gift" | "cooking" | "gardening" | "playing" | "returning";

type StateDef = {
  /** Higher wins. A running state is only replaced by an equal or higher one. */
  priority: number;
  /** ms before drifting back to rest; null means it holds until replaced. */
  duration: number | null;
};

const STATES: Record<AnimState, StateDef> = {
  idle: { priority: 0, duration: null },
  wander: { priority: 1, duration: 2_600 },
  float: { priority: 1, duration: 2_800 },
  peek: { priority: 1, duration: 2_200 },
  sway: { priority: 1, duration: 2_400 },
  shimmy: { priority: 1, duration: 2_200 },
  stretch: { priority: 1, duration: 1_900 },
  ponder: { priority: 1, duration: 3_200 },
  book: { priority: 1, duration: 5_200 },
  window: { priority: 1, duration: 4_800 },
  lamp: { priority: 1, duration: 3_200 },
  roll: { priority: 2, duration: 2_600 },
  singing: { priority: 2, duration: 4_000 },
  curious: { priority: 1, duration: 4_600 },
  sleepy: { priority: 1, duration: 3_400 },
  petting: { priority: 2, duration: 900 },
  brushing: { priority: 2, duration: 1_400 },
  playing: { priority: 2, duration: 2_000 },
  gift: { priority: 2, duration: 2_000 },
  tickle: { priority: 3, duration: 1_500 },
  happy: { priority: 3, duration: 2_300 },
  spin: { priority: 3, duration: 1_550 },
  dancing: { priority: 3, duration: 3_600 },
  eating: { priority: 3, duration: 2_200 },
  hugging: { priority: 3, duration: 2_400 },
  cooking: { priority: 3, duration: 2_600 },
  gardening: { priority: 3, duration: 2_600 },
  waking: { priority: 4, duration: 1_800 },
  returning: { priority: 4, duration: 3_000 },
  asleep: { priority: 5, duration: null },
  hatching: { priority: 9, duration: 3_200 },
  evolving: { priority: 9, duration: 4_000 },
};

/** Spring constants for the drift and the gaze. Tuned, not physical. */
const POSITION_STIFFNESS = 0.028;
const POSITION_DAMPING = 0.84;
const GAZE_STIFFNESS = 0.09;
const GAZE_DAMPING = 0.72;

type Options = {
  /** Called once whenever the visible state changes — never per frame. */
  onStateChange?: (state: AnimState) => void;
};

export class NiumpiAnimationController {
  private root: HTMLElement | null = null;
  private frame = 0;
  private blinkTimer: number | undefined;
  private stateTimer: number | undefined;
  private unsubscribeMotion: (() => void) | null = null;

  private state: AnimState = "idle";
  /** What to fall back to once a transient state finishes. */
  private restState: AnimState = "idle";
  private queue: AnimState[] = [];
  private reduced = false;
  private options: Options;
  private listeners = new Set<(state: AnimState) => void>();

  private target = { x: 0, y: 0, gazeX: 0, gazeY: 0 };
  private value = { x: 0, y: 0, vx: 0, vy: 0, gazeX: 0, gazeY: 0, vgx: 0, vgy: 0 };

  constructor(options: Options = {}) {
    this.options = options;
  }

  attach(root: HTMLElement) {
    if (this.root === root) return;
    this.root = root;
    this.reduced = prefersReducedMotion();
    this.applyState();
    this.startLoop();
    this.scheduleBlink();
    this.unsubscribeMotion = onMotionChange((reduced) => {
      this.reduced = reduced;
      this.root?.classList.toggle("is-reduced", reduced);
      if (reduced) this.snap();
    });
    root.classList.toggle("is-reduced", this.reduced);
  }

  detach() {
    if (this.frame) window.cancelAnimationFrame(this.frame);
    window.clearTimeout(this.blinkTimer);
    window.clearTimeout(this.stateTimer);
    this.unsubscribeMotion?.();
    this.unsubscribeMotion = null;
    this.frame = 0;
    this.root = null;
  }

  /** Ask for a state. Lower-priority requests are dropped, not queued behind. */
  request(next: AnimState) {
    const incoming = STATES[next];
    const current = STATES[this.state];
    if (!incoming) return;
    if (incoming.priority < current.priority && current.duration !== null) {
      // Something more important is playing — remember it only if it is close.
      if (incoming.priority >= current.priority - 1) this.queue = [next];
      return;
    }
    this.setState(next);
  }

  /** Resting state the creature drifts back to (idle while awake, asleep at night). */
  setRest(state: AnimState) {
    this.restState = state;
    if (STATES[this.state].duration === null && this.state !== state) this.setState(state);
  }

  setPosition(x: number, y: number) {
    this.target.x = x;
    this.target.y = y;
    if (this.reduced) this.snap();
  }

  setGaze(x: number, y: number) {
    this.target.gazeX = x;
    this.target.gazeY = y;
    if (this.reduced) this.snap();
  }

  setPressed(pressed: boolean) {
    this.root?.classList.toggle("is-pressed", pressed);
  }

  setTargeted(targeted: boolean) {
    this.root?.classList.toggle("is-target", targeted);
  }

  getState(): AnimState {
    return this.state;
  }

  /** Room scenery listens only to state changes, never to animation frames. */
  subscribeState(listener: (state: AnimState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  /* ------------------------------------------------------------------ */

  private setState(next: AnimState) {
    if (this.state === next) return;
    this.state = next;
    this.applyState();
    this.options.onStateChange?.(next);
    this.listeners.forEach((listener) => listener(next));
    window.clearTimeout(this.stateTimer);
    const { duration } = STATES[next];
    if (duration === null) return;
    // Reduced motion still changes state, it just spends less time there.
    const span = this.reduced ? Math.min(duration, 400) : duration;
    this.stateTimer = window.setTimeout(() => {
      const queued = this.queue.shift();
      this.setState(queued ?? this.restState);
    }, span);
  }

  private applyState() {
    const root = this.root;
    if (!root) return;
    root.dataset.anim = this.state;
    // One class swap per state change keeps the CSS layer in charge of the look.
    root.className = root.className.replace(/\bbehavior-[\w-]+/g, "").trim();
    root.classList.add(`behavior-${this.state}`);
  }

  private startLoop() {
    if (this.frame) return;
    const step = () => {
      this.tick();
      this.frame = window.requestAnimationFrame(step);
    };
    this.frame = window.requestAnimationFrame(step);
  }

  /** The only per-frame work in the app: four springs and five CSS variables. */
  private tick() {
    const root = this.root;
    if (!root) return;
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
    style.setProperty("--gaze-tilt", `${(value.gazeX * 0.16).toFixed(2)}deg`);
  }

  private snap() {
    this.value.x = this.target.x; this.value.y = this.target.y;
    this.value.gazeX = this.target.gazeX; this.value.gazeY = this.target.gazeY;
    this.value.vx = 0; this.value.vy = 0; this.value.vgx = 0; this.value.vgy = 0;
  }

  /** Blinking is a class toggle on a timer, not React state. */
  private scheduleBlink() {
    const run = () => {
      this.blinkTimer = window.setTimeout(() => {
        if (this.reduced || this.state === "asleep") { run(); return; }
        this.root?.classList.add("is-blinking");
        this.blinkTimer = window.setTimeout(() => {
          this.root?.classList.remove("is-blinking");
          run();
        }, 145);
      }, 1_800 + Math.random() * 3_200);
    };
    run();
  }
}
