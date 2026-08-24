import type { Transition, Variants } from "motion/react";

/**
 * Shared Framer Motion presets. Durations live here rather than in components
 * so the whole app changes tempo in one place, and every preset degrades
 * cleanly when the runtime reports a reduced-motion preference.
 */
export const easeOut: Transition = { duration: 0.28, ease: [0.22, 0.9, 0.3, 1] };
export const easeSnappy: Transition = { duration: 0.18, ease: [0.22, 0.9, 0.3, 1] };
export const spring: Transition = { type: "spring", stiffness: 320, damping: 30, mass: 0.7 };

/**
 * Scene entry animates transform only. Content visibility must never depend on
 * an animation finishing — a throttled or interrupted frame loop would
 * otherwise leave a whole scene stuck at zero opacity.
 */
export const sceneVariants: Variants = {
  enter: { y: 16 },
  center: { y: 0 },
};

/** Spread onto a motion element for a standard fade-and-lift. */
export const fadeSlide = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: easeOut,
} as const;

/**
 * Enter-only lift. No exit and no opacity, so a view is always visible the
 * instant it mounts — animation is decoration, never a gate on content.
 */
export const enterLift = {
  initial: { y: 10 },
  animate: { y: 0 },
  transition: easeOut,
} as const;

/*
 * Scale only on the way in. Fading from `opacity: 0` means a modal is invisible
 * until a frame loop runs, and a throttled or stalled rAF leaves it there —
 * present in the DOM, clickable by a test, and blank to a person. Scale
 * degrades safely: the worst case is content that arrives at full size.
 */
export const popIn = {
  initial: { scale: 0.94 },
  animate: { scale: 1 },
  exit: { opacity: 0, scale: 0.97 },
  transition: spring,
} as const;

/** Cards lift on hover and press down on tap — never a layout-shifting move. */
export const cardHover = {
  whileHover: { y: -3 },
  whileTap: { scale: 0.985 },
  transition: easeSnappy,
} as const;
