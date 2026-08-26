import assert from "node:assert/strict";
import test from "node:test";

import {
  assetForSpriteEvent,
  mixForSoundscape,
  spriteAudioEventKey,
  type SoundscapeState,
  type SpriteAudioEvent,
} from "../app/audio/director.ts";

const base: SoundscapeState = {
  scene: "home",
  stage: 3,
  route: null,
  mood: "happy",
  weather: "sunny",
  sleeping: false,
  lampOn: true,
  musicEnabled: true,
  effectsEnabled: true,
  lowPower: false,
};

function event(type: string, payload?: Record<string, string | number | boolean>): SpriteAudioEvent {
  return {
    sequence: 9,
    type,
    clip: "eat",
    authoredFrame: 33,
    observedFrame: 34,
    payload,
    synthetic: false,
    spriteToken: 17,
  };
}

test("adaptive score grows and route orchestration remains musical", () => {
  const baby = mixForSoundscape({ ...base, stage: 1 });
  const final = mixForSoundscape({ ...base, stage: 5 });
  const sparkleap = mixForSoundscape({ ...base, stage: 5, route: "sparkleap" });
  const moonveil = mixForSoundscape({ ...base, stage: 5, route: "moonveil" });

  assert.ok(final.stems.music_warmth > baby.stems.music_warmth);
  assert.ok(final.stems.music_sparkle > baby.stems.music_sparkle);
  assert.ok(sparkleap.stems.music_sparkle > final.stems.music_sparkle);
  assert.ok(moonveil.lowpassHz < final.lowpassHz);
});

test("sleep, weather and low power reshape the arrangement without restarting it", () => {
  const awake = mixForSoundscape(base);
  const asleep = mixForSoundscape({ ...base, sleeping: true, mood: "dreaming", weather: "rainy" });
  const economical = mixForSoundscape({ ...base, lowPower: true });

  assert.ok(asleep.stems.music_warmth > asleep.stems.music_sparkle * 10);
  assert.ok(asleep.lowpassHz < awake.lowpassHz);
  assert.ok(asleep.transitionSeconds > awake.transitionSeconds);
  assert.ok(economical.stems.music_sparkle < awake.stems.music_sparkle);
});

test("music off is a true zero for stems and ambience", () => {
  const silent = mixForSoundscape({ ...base, scene: "garden", weather: "rainy", musicEnabled: false });
  assert.deepEqual(Object.values(silent.stems), [0, 0, 0]);
  assert.deepEqual(Object.values(silent.ambience), [0, 0]);
});

test("authored animation markers select exact reaction sounds", () => {
  assert.equal(assetForSpriteEvent(event("bite", { bite: 1 })), "bite_1");
  assert.equal(assetForSpriteEvent(event("bite", { bite: 3 })), "bite_3");
  assert.equal(assetForSpriteEvent(event("bite", { bite: 99 })), "bite_3");
  assert.equal(assetForSpriteEvent(event("swallow")), "swallow");
  assert.equal(assetForSpriteEvent(event("dance_beat", { index: 4 })), "dance_beat_4");
  assert.equal(assetForSpriteEvent(event("vocal_phrase", { index: 2 })), "sing_phrase_2");
  assert.equal(assetForSpriteEvent(event("travel_pulse", { index: 2 })), "travel_pulse_2");
  assert.equal(assetForSpriteEvent(event("page_turn")), "page_turn");
  assert.equal(assetForSpriteEvent({ ...event("clip_start"), clip: "look_left" }), "look_left");
  assert.equal(assetForSpriteEvent({ ...event("lamp_contact"), clip: "lamp" }), "ui_tap");
  assert.equal(assetForSpriteEvent({ ...event("cozy_curl"), clip: "cozy" }), "pet_purr");
  assert.equal(assetForSpriteEvent(event("unknown_marker")), null);
});

test("presentation dedupe survives rAF lateness and trace sequence changes", () => {
  const authored = event("bite", { bite: 1 });
  const late = { ...authored, sequence: 22, observedFrame: 39 };
  assert.equal(spriteAudioEventKey(authored), spriteAudioEventKey(late));
  assert.notEqual(spriteAudioEventKey(authored), spriteAudioEventKey({ ...late, spriteToken: 18 }));
});
