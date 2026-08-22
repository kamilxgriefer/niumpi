import type { GameState, MoodId } from "./types.ts";
import { LOW_STAT } from "./stats.ts";
import { dayPartAt } from "./time.ts";

export type MoodInfo = { id: MoodId; label: string; leaf: string; colour: string; motion: string };

export const moodTable: Record<MoodId, MoodInfo> = {
  excited: { id: "excited", label: "Excited", leaf: "Quick bounces and sparks", colour: "turquoise", motion: "bounce" },
  happy: { id: "happy", label: "Happy", leaf: "Calm floating", colour: "green", motion: "float" },
  tired: { id: "tired", label: "Tired", leaf: "Sinking slowly", colour: "yellow", motion: "sink" },
  hungry: { id: "hungry", label: "Hungry", leaf: "A small tremble", colour: "orange", motion: "tremble" },
  curious: { id: "curious", label: "Curious", leaf: "Turning and tilting", colour: "blue", motion: "turn" },
  upset: { id: "upset", label: "Upset", leaf: "Dimmed and low", colour: "pink", motion: "dim" },
  dreaming: { id: "dreaming", label: "Dreaming", leaf: "Star motes", colour: "violet", motion: "motes" },
  evolving: { id: "evolving", label: "Evolving", leaf: "A strong glow", colour: "prism", motion: "glow" },
};

/**
 * One mood, derived — never stored — so it can never drift from the stats the
 * player can see. Order is priority: needs first, then feeling.
 */
export function moodFor(state: GameState, now: number): MoodId {
  if (state.niumpi.sleeping) return "dreaming";
  if (state.stats.fullness < LOW_STAT) return "hungry";
  if (state.stats.energy < LOW_STAT) return "tired";
  if (state.stats.joy < LOW_STAT) return "upset";
  if (state.stats.joy > 82 && state.stats.energy > 60) return "excited";
  const part = dayPartAt(now);
  if (part === "night" && state.stats.energy < 55) return "tired";
  if (state.stats.curiosity > 55) return "curious";
  return "happy";
}

/** Up to three chips for "Today's vibe", never contradicting each other. */
export function vibeChips(state: GameState, now: number): Array<{ id: string; label: string; art: string }> {
  const mood = moodFor(state, now);
  const chips: Array<{ id: string; label: string; art: string }> = [
    { id: mood, label: moodTable[mood].label, art: mood },
  ];
  const part = dayPartAt(now);
  if (mood !== "hungry" && state.stats.fullness < 55) chips.push({ id: "peckish", label: "Peckish", art: "hungry" });
  if (mood !== "curious" && state.stats.curiosity > 40) chips.push({ id: "curious", label: "Curious", art: "curious" });
  if (chips.length < 3 && state.weather.key === "rainy") chips.push({ id: "cozy", label: "Cozy", art: "rain" });
  if (chips.length < 3 && state.weather.key === "starfall") chips.push({ id: "wonder", label: "Wonder-struck", art: "star" });
  if (chips.length < 3 && part === "night") chips.push({ id: "quiet", label: "Quiet", art: "moon" });
  if (chips.length < 3 && state.stats.joy > 70) chips.push({ id: "playful", label: "Playful", art: "playful" });
  return chips.slice(0, 3);
}
