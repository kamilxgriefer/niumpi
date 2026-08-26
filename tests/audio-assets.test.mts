import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const audioRoot = join(process.cwd(), "public/audio/niumpi-v1");
const manifestPath = join(audioRoot, "manifest.json");

type Source = { src: string; type: string; bytes: number; sha256: string };
type Asset = {
  id: string;
  category: "music" | "ambience" | "effects";
  loop: boolean;
  durationSeconds: number;
  sampleRate: number;
  sampleCount: number;
  measuredPeakDbfs: number;
  sources: Source[];
};
type Manifest = {
  version: number;
  sampleRate: number;
  provenance: { kind: string; samplesFromInternet: boolean; humanVoice: boolean };
  mix: { musicLoopSampleCount: number; musicLoopDurationMs: number; recommendedMasterGainDb: number };
  assets: Record<string, Asset>;
  cueMap: Record<string, string[]>;
};

const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;

function sourcePath(source: Source) {
  return join(process.cwd(), "public", source.src.replace(/^\//, ""));
}

test("audio library is original, bounded and internally complete", () => {
  assert.equal(manifest.version, 1);
  assert.equal(manifest.sampleRate, 48_000);
  assert.equal(manifest.provenance.kind, "procedural-original");
  assert.equal(manifest.provenance.samplesFromInternet, false);
  assert.equal(manifest.provenance.humanVoice, false);
  assert.equal(Object.keys(manifest.assets).length, 67);
  assert.ok(manifest.mix.recommendedMasterGainDb <= -3);

  for (const [id, asset] of Object.entries(manifest.assets)) {
    assert.equal(asset.id, id);
    assert.equal(asset.sampleRate, 48_000);
    assert.ok(asset.durationSeconds > 0);
    assert.ok(asset.measuredPeakDbfs <= -1);
    assert.ok(asset.sources.length >= 1);
    for (const source of asset.sources) {
      const path = sourcePath(source);
      const bytes = readFileSync(path);
      assert.equal(statSync(path).size, source.bytes, `${id} byte count`);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), source.sha256, `${id} source hash`);
      assert.ok(source.bytes < 1_000_000, `${id} remains stream-friendly`);
    }
  }
  for (const ids of Object.values(manifest.cueMap)) {
    for (const id of ids) assert.ok(manifest.assets[id], `cueMap references ${id}`);
  }
});

test("all music stems are phase-aligned and have dual browser codecs", () => {
  const stems = ["music_base", "music_warmth", "music_sparkle"].map((id) => manifest.assets[id]);
  assert.equal(manifest.mix.musicLoopSampleCount, 1_536_000);
  assert.equal(manifest.mix.musicLoopDurationMs, 32_000);
  for (const stem of stems) {
    assert.equal(stem.loop, true);
    assert.equal(stem.sampleCount, manifest.mix.musicLoopSampleCount);
    assert.deepEqual(stem.sources.map((source) => source.type), [
      "audio/webm; codecs=opus",
      "audio/mp4; codecs=mp4a.40.2",
    ]);
  }
});

test("reaction WAV files are low-latency 48 kHz mono PCM16", () => {
  for (const asset of Object.values(manifest.assets).filter((entry) => entry.category === "effects")) {
    assert.equal(asset.sources.length, 1);
    const bytes = readFileSync(sourcePath(asset.sources[0]));
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF", asset.id);
    assert.equal(bytes.toString("ascii", 8, 12), "WAVE", asset.id);
    assert.equal(bytes.readUInt16LE(22), 1, `${asset.id} mono`);
    assert.equal(bytes.readUInt32LE(24), 48_000, `${asset.id} sample rate`);
    assert.equal(bytes.readUInt16LE(34), 16, `${asset.id} bit depth`);
  }
});
