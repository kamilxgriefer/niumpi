import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTINUOUS_DURATIONS,
  CONTINUOUS_FPS,
  motionFrameAtTime,
  sampleContinuousMotion,
  type MotionSample,
} from "../app/anim/NiumpiContinuousMotion.ts";
import type { FrameClip } from "../app/anim/NiumpiFrameMachine.ts";

const clips = Object.keys(CONTINUOUS_DURATIONS) as FrameClip[];
const frameMs = 1_000 / CONTINUOUS_FPS;

function delta(a: MotionSample, b: MotionSample, key: keyof MotionSample): number {
  return Math.abs(a[key] - b[key]);
}

test("continuous motion supplies hundreds of genuine 60 FPS samples", () => {
  assert.equal(CONTINUOUS_FPS, 60);
  assert.equal(Math.round(CONTINUOUS_DURATIONS.idle / frameMs), 360);
  for (const clip of clips) {
    const frames = Math.round(CONTINUOUS_DURATIONS[clip] / frameMs);
    const signatures = new Set<string>();
    for (let index = 0; index < frames; index += 1) {
      const sample = sampleContinuousMotion(clip, index * frameMs);
      signatures.add(Object.values(sample).map((value) => value.toFixed(5)).join(":"));
      assert.equal(motionFrameAtTime(clip, index * frameMs), index);
    }
    assert.ok(signatures.size >= frames * 0.9, `${clip} only has ${signatures.size}/${frames} distinct samples`);
  }
});

test("idle closes its loop without a pose cut", () => {
  const start = sampleContinuousMotion("idle", 0);
  const beforeLoop = sampleContinuousMotion("idle", CONTINUOUS_DURATIONS.idle - frameMs);
  const limits: Partial<Record<keyof MotionSample, number>> = {
    x: 0.01, y: 0.01, rotate: 0.01, scaleX: 0.01, scaleY: 0.01,
    wobble: 0.05, leaf: 0.05, leftArm: 0.05, rightArm: 0.05,
    gazeX: 0.05, gazeY: 0.05, blink: 0.05,
  };
  for (const [key, limit] of Object.entries(limits) as [keyof MotionSample, number][]) {
    assert.ok(delta(start, beforeLoop, key) <= limit, `${key} cuts at the idle loop boundary`);
  }
});

test("no authored reaction contains the former midpoint image switch", () => {
  const limits: Partial<Record<keyof MotionSample, number>> = {
    x: 0.045, y: 0.07, rotate: 0.08, scaleX: 0.065, scaleY: 0.075,
    wobble: 0.16, leaf: 0.28, leftArm: 0.28, rightArm: 0.28,
    gazeX: 0.4, gazeY: 0.32, blink: 0.42, smile: 0.22,
  };
  for (const clip of clips) {
    const frames = Math.round(CONTINUOUS_DURATIONS[clip] / frameMs);
    let previous = sampleContinuousMotion(clip, 0);
    for (let index = 1; index < frames; index += 1) {
      const current = sampleContinuousMotion(clip, index * frameMs);
      for (const [key, limit] of Object.entries(limits) as [keyof MotionSample, number][]) {
        assert.ok(delta(previous, current, key) <= limit, `${clip} ${key} jumps at frame ${index}`);
      }
      previous = current;
    }
  }
});

test("reactions recover to the same resting contact pose", () => {
  for (const clip of ["look", "tap_reaction", "happy", "hatch_complete"] as FrameClip[]) {
    const end = sampleContinuousMotion(clip, CONTINUOUS_DURATIONS[clip]);
    assert.ok(Math.abs(end.x) < 0.001, `${clip} x recovery`);
    assert.ok(Math.abs(end.y) < 0.001, `${clip} y recovery`);
    assert.ok(Math.abs(end.rotate) < 0.001, `${clip} rotation recovery`);
    assert.ok(Math.abs(end.scaleX - 1) < 0.001, `${clip} x scale recovery`);
    assert.ok(Math.abs(end.scaleY - 1) < 0.001, `${clip} y scale recovery`);
  }
});
