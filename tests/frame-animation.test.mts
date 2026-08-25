import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  NIUMPI_ANIMATION_CLIPS,
  NIUMPI_MODEL_VARIANTS,
  variantFor,
  type BlenderManifest,
} from "../app/anim/NiumpiModelVariants.ts";

const root = process.cwd();
const modelRoot = join(root, "public", "assets", "niumpi", "models");
const manifest = JSON.parse(readFileSync(join(modelRoot, "manifest.json"), "utf8")) as BlenderManifest;

test("the production character manifest exposes every Blender evolution and performance", () => {
  assert.equal(manifest.renderer, "blender-gltf");
  assert.match(manifest.blenderVersion, /^5\./);
  assert.equal(manifest.fps, 24);
  assert.deepEqual(manifest.variants, [...NIUMPI_MODEL_VARIANTS]);
  assert.deepEqual(Object.keys(manifest.clips), NIUMPI_ANIMATION_CLIPS);

  let previousEnd = 0;
  for (const name of NIUMPI_ANIMATION_CLIPS) {
    const clip = manifest.clips[name];
    assert.ok(clip.startFrame > previousEnd, `${name} overlaps the previous performance`);
    assert.ok(clip.endFrame > clip.startFrame, `${name} has no authored motion`);
    assert.ok(clip.durationSeconds >= 0.75, `${name} is too short to read as a performance`);
    assert.equal(clip.startSeconds, clip.startFrame / manifest.fps);
    previousEnd = clip.endFrame;
  }
});

test("every evolution is a substantial, animated binary glTF asset", () => {
  for (const variant of NIUMPI_MODEL_VARIANTS) {
    const model = join(modelRoot, `${variant}.glb`);
    const bytes = readFileSync(model);
    assert.ok(bytes.length > 700_000, `${variant} looks like a placeholder`);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "glTF");
    const document = bytes.toString("utf8");
    assert.match(document, /NiumpiRoot/);
    assert.match(document, /animations/);
    assert.match(document, /BodyControl/);
    assert.match(document, /LeftEyeControl/);
    assert.match(document, /RightEyeControl/);
  }
});

test("the editable Blender source and reproducible generator ship with the game", () => {
  const source = join(root, "art", "blender", "niumpi-master.blend");
  const builder = join(root, "tools", "blender", "build_niumpi_3d.py");
  assert.ok(readFileSync(source).length > 250_000);
  const script = readFileSync(builder, "utf8");
  for (const clip of NIUMPI_ANIMATION_CLIPS) assert.match(script, new RegExp(`\\"${clip}\\"`));
});

test("growth stages and final care routes resolve to stable model identities", () => {
  assert.equal(variantFor(1, "seedling"), "stage-1");
  assert.equal(variantFor(4, "moonveil"), "stage-4");
  assert.equal(variantFor(5, "seedling"), "stage-5");
  assert.equal(variantFor(5, "moonveil"), "moonveil");
  assert.equal(variantFor(7, "bloomheart"), "bloomheart");
});
