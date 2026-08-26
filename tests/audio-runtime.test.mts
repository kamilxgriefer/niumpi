import assert from "node:assert/strict";
import test from "node:test";

import { NiumpiAudioDirector } from "../app/audio/AudioDirector.ts";

test("runtime never creates or schedules audio before a trusted gesture", async () => {
  const director = new NiumpiAudioDirector();
  director.configure({
    scene: "home",
    stage: 1,
    route: null,
    mood: "happy",
    weather: "sunny",
    sleeping: false,
    lampOn: true,
    musicEnabled: true,
    effectsEnabled: true,
    lowPower: false,
  });

  assert.equal(await director.play("ui_tap", { source: "ui" }), false);
  assert.equal(await director.unlock(false), false);
  assert.deepEqual(director.snapshot(), {
    state: "locked",
    contextState: "none",
    activeVoices: 0,
    activeLoops: 0,
    decodedBuffers: 0,
    cueCount: 0,
    dedupedCount: 0,
    droppedCount: 2,
  });
  await director.dispose();
});

test("muted authored markers are consumed without becoming a later replay", async () => {
  const director = new NiumpiAudioDirector();
  const first = await director.play("bite_1", { dedupeKey: "3:33:bite", source: "animation" });
  const duplicate = await director.play("bite_1", { dedupeKey: "3:33:bite", source: "animation" });
  assert.equal(first, false);
  assert.equal(duplicate, false);
  assert.equal(director.snapshot().dedupedCount, 1);
  assert.equal(director.snapshot().cueCount, 0);
  await director.dispose();
});
