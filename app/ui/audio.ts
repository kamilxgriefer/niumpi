"use client";

import { NiumpiAudioDirector } from "../audio/AudioDirector";
import type { AudioChannel, PlayAssetOptions } from "../audio/AudioDirector";
import type { AudioAssetId, SoundscapeState } from "../audio/director";
import type { FeedbackSoundId } from "../game/types";

export type CueName = FeedbackSoundId;

const cueAssets: Record<CueName, AudioAssetId> = {
  tap: "ui_tap",
  pet: "pet_purr",
  hold: "hold_warm",
  leaf: "leaf_rustle",
  eat: "eat_anticipate",
  // These are the tactile anticipation cues. Authored eye-close/wake markers
  // own the later settle/rise sounds, so the same sample never doubles.
  sleep: "cozy_contact",
  wake: "ui_confirm",
  blip: "ui_tap",
  chime: "ui_confirm",
  hatch: "evolve_rise",
  evolve: "evolve_rise",
  reward: "ui_reward",
  fail: "ui_fail",
  wash: "wash_splash",
  lamp: "lamp_glow",
  book: "book_open",
  roll: "roll_launch",
  sad: "sad_sigh",
  rare: "loot_rare",
  legendary: "loot_legendary",
};

const cueOptions: Partial<Record<CueName, PlayAssetOptions>> = {
  tap: { gain: 0.82, priority: 1 },
  blip: { gain: 0.72, priority: 1 },
  pet: { gain: 0.9, priority: 2 },
  hatch: { gain: 1, priority: 4 },
  evolve: { gain: 1, priority: 4 },
  reward: { gain: 0.94, priority: 3 },
  rare: { gain: 0.96, priority: 3 },
  legendary: { gain: 1, priority: 4 },
  fail: { gain: 0.76, priority: 2 },
};

let singleton: NiumpiAudioDirector | null = null;

function audioDirector() {
  singleton ??= new NiumpiAudioDirector();
  return singleton;
}

/** Mounts the one session-long director and its trusted-gesture/event bridge. */
export function mountAudioRuntime() {
  return audioDirector().mount();
}

/** Stores the world mix before unlock and crossfades it once audio is running. */
export function syncSoundscape(state: SoundscapeState) {
  audioDirector().configure(state);
}

export function setChannelVolume(channel: AudioChannel, volume: number) {
  audioDirector().setChannelVolume(channel, volume);
}

export function unlockAudio(event: Event) {
  return audioDirector().unlock(event.isTrusted);
}

export function playAudioAsset(id: AudioAssetId, options: PlayAssetOptions = {}) {
  return audioDirector().play(id, options);
}

/** Compatibility adapter for existing game callsites during the typed migration. */
export function playCue(name: CueName, options: PlayAssetOptions = {}) {
  return audioDirector().play(cueAssets[name], {
    source: "action",
    ...cueOptions[name],
    ...options,
  });
}

/** Seed now uses the same continuous motif; scene state performs the crossfade. */
export function startSeedLullaby() {
  // The first trusted care gesture unlocks the context in capture phase. The
  // score itself is selected from GameProvider's `scene: seed` soundscape.
}

export function stopSeedLullaby() {
  // Leaving Seed changes the shared score instead of abandoning JS timers.
}

export async function resetAudioForTests() {
  const current = singleton;
  singleton = null;
  await current?.dispose();
}
