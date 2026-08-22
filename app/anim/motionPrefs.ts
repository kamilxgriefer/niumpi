/**
 * One source of truth for motion preference. Reads the OS setting, lets the
 * player override it in Settings, and notifies listeners so the animation
 * controller and Framer Motion agree without either polling the other.
 */
export type MotionPreference = "system" | "on" | "off";

let override: MotionPreference = "system";
const listeners = new Set<(reduced: boolean) => void>();

function systemPrefersReduced(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function prefersReducedMotion(): boolean {
  if (override === "on") return true;
  if (override === "off") return false;
  return systemPrefersReduced();
}

export function setMotionPreference(value: MotionPreference) {
  if (override === value) return;
  override = value;
  const reduced = prefersReducedMotion();
  listeners.forEach((listener) => listener(reduced));
}

export function onMotionChange(listener: (reduced: boolean) => void): () => void {
  listeners.add(listener);
  if (typeof window !== "undefined" && window.matchMedia) {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handle = () => listener(prefersReducedMotion());
    query.addEventListener("change", handle);
    return () => { listeners.delete(listener); query.removeEventListener("change", handle); };
  }
  return () => listeners.delete(listener);
}
