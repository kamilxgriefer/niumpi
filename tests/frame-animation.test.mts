import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  frameIndexAtTime,
  NiumpiFrameMachine,
  variantFor,
  type FrameClip,
  type FrameManifest,
} from "../app/anim/NiumpiFrameMachine.ts";

const assetRoot = join(process.cwd(), "public/assets/niumpi/frame-animation");
const artifactRoot = join(process.cwd(), "artifacts/niumpi-frame-animation");
const sourceRoot = join(artifactRoot, "frames");
const manifest = JSON.parse(readFileSync(join(assetRoot, "manifest.json"), "utf8")) as FrameManifest;
const requiredCounts: Record<FrameClip, number> = {
  idle: 48,
  blink: 8,
  look: 16,
  tap_reaction: 24,
  happy: 32,
  hatch_complete: 36,
};
const variants = [
  "stage-1", "stage-2", "stage-3", "stage-4", "stage-5",
  "moonveil", "bloomheart", "sparkleap", "mistwander", "prismatic",
];

test("frame manifest contains every evolution, clip and ordered rectangle", () => {
  assert.equal(manifest.fps, 24);
  assert.equal(manifest.totalFramesPerVariant, 164);
  assert.deepEqual(Object.keys(manifest.variants), variants);
  for (const [name, expected] of Object.entries(requiredCounts) as [FrameClip, number][]) {
    const clip = manifest.clips[name];
    assert.equal(clip.frameCount, expected, name);
    assert.equal(clip.frames.length, expected, name);
    clip.frames.forEach((frame, index) => {
      assert.equal(frame.index, index);
      assert.equal(frame.w, manifest.frameSize.width);
      assert.equal(frame.h, manifest.frameSize.height);
      assert.ok(frame.durationMs > 41 && frame.durationMs < 42);
    });
  }
});

test("every variant has a real atlas, pose sheet, layers and all source frames", () => {
  for (const variant of variants) {
    const entry = manifest.variants[variant];
    const atlas = join(process.cwd(), "public", entry.atlas);
    assert.ok(existsSync(atlas), atlas);
    assert.ok(statSync(atlas).size > 100_000, `${variant} atlas is not a placeholder`);
    assert.ok(existsSync(join(artifactRoot, "pose-sheets", `${variant}.png`)), `${variant} pose sheet`);
    const layers = readdirSync(join(artifactRoot, "layers", variant)).filter((name) => name.endsWith(".png"));
    assert.equal(layers.length, 9, `${variant} logical layer masks`);
    for (const [clip, count] of Object.entries(requiredCounts)) {
      const frames = readdirSync(join(sourceRoot, variant, clip)).filter((name) => name.endsWith(".webp"));
      assert.equal(frames.length, count, `${variant}/${clip}`);
    }
  }
});

test("sequential source frames change instead of repeating one drawing", () => {
  for (const [clip, count] of Object.entries(requiredCounts)) {
    const directory = join(sourceRoot, "stage-1", clip);
    const hashes = Array.from({ length: count }, (_, index) => createHash("sha256")
      .update(readFileSync(join(directory, `${String(index).padStart(3, "0")}.webp`)))
      .digest("hex"));
    for (let index = 1; index < hashes.length; index += 1) {
      assert.notEqual(hashes[index], hashes[index - 1], `${clip} repeats adjacent frame ${index}`);
    }
  }
});

test("frame selection depends on elapsed time, not render count", () => {
  const idle = manifest.clips.idle;
  assert.equal(frameIndexAtTime(idle, 0), 0);
  assert.equal(frameIndexAtTime(idle, 500), frameIndexAtTime(idle, 500));
  assert.equal(frameIndexAtTime(idle, idle.durationMs + 500), frameIndexAtTime(idle, 500));
  assert.ok(frameIndexAtTime(idle, 900) > frameIndexAtTime(idle, 100));
  const blink = manifest.clips.blink;
  assert.equal(frameIndexAtTime(blink, blink.durationMs + 5_000), blink.frameCount - 1);
});

test("playback priority protects hatch and touch reactions from blink requests", () => {
  const durations = Object.fromEntries(
    Object.entries(manifest.clips).map(([name, clip]) => [name, clip.durationMs]),
  ) as Record<FrameClip, number>;
  const entering = new NiumpiFrameMachine("ENTERING", 0, durations);
  assert.equal(entering.request("REACTING", 20).accepted, false);
  assert.equal(entering.advance(durations.hatch_complete + 1).state, "IDLE");

  const reaction = new NiumpiFrameMachine("IDLE", 0, durations);
  assert.equal(reaction.request("LOOKING", 10).accepted, true);
  assert.equal(reaction.request("REACTING", 20).accepted, true);
  assert.equal(reaction.request("BLINKING", 30).accepted, false);
  for (let index = 0; index < 20; index += 1) reaction.request("REACTING", 31 + index);
  assert.equal(reaction.snapshot().state, "REACTING");
  assert.equal(reaction.advance(20 + durations.tap_reaction + 1).state, "IDLE");
});

test("variant routing preserves every visible growth stage and final route", () => {
  assert.equal(variantFor(1, "seedling"), "stage-1");
  assert.equal(variantFor(4, "moonveil"), "stage-4");
  assert.equal(variantFor(5, "moonveil"), "moonveil");
  assert.equal(variantFor(5, "prismatic"), "prismatic");
});
