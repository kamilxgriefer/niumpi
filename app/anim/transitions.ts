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
 * Kept for reference, no longer applied to the scene container.
 *
 * Animating the scene root moved every control inside it for ~300ms after
 * mount, and the router remounts that container once the save has loaded, so
 * the movement replayed exactly when the first buttons became clickable.
 * Scene entry is now instant; per-element motion lives on the elements.
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

export const popIn = {
  initial: { opacity: 0, scale: 0.94 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.97 },
  transition: spring,
} as const;

/** Cards lift on hover and press down on tap — never a layout-shifting move. */
export const cardHover = {
  whileHover: { y: -3 },
  whileTap: { scale: 0.985 },
  transition: easeSnappy,
} as const;
