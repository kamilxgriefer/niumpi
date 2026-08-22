import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("the root route mounts the Niumpi game", async () => {
  const page = await read("app/page.tsx");

  assert.match(page, /import \{ NiumpiScene \} from "\.\/NiumpiScene"/);
  assert.match(page, /title:\s*"Niumpi/);
  assert.match(page, /return <NiumpiScene \/>/);
});

test("the care scene keeps a versioned save and accessible controls", async () => {
  const [scene, rig] = await Promise.all([
    read("app/NiumpiScene.tsx"),
    read("app/RiggedNiumpi.tsx"),
  ]);

  assert.match(scene, /const STORAGE_KEY = "niumpi-memory-v2"/);
  assert.match(scene, /window\.localStorage\.setItem\(STORAGE_KEY/);
  assert.match(scene, /aria-label="Niumpi's room"/);
  assert.match(scene, /aria-label="Niumpi's needs"/);
  assert.match(scene, /aria-label="Food tray"/);
  assert.match(scene, /aria-pressed=\{soundEnabled\}/);
  assert.match(scene, /aria-pressed=\{memory\.lampOn\}/);
  assert.match(rig, /aria-label="Pet Niumpi"/);
  assert.match(rig, /aria-label="Touch Niumpi's leaf"/);
});

test("quality scripts cover lint, types, build and browser tests", async () => {
  const packageJson = JSON.parse(await read("package.json"));

  assert.equal(packageJson.scripts.lint, "eslint . --ignore-pattern dist --ignore-pattern .next");
  assert.equal(packageJson.scripts.typecheck, "tsc --noEmit");
  assert.equal(packageJson.scripts.build, "WRANGLER_LOG_PATH=.wrangler/wrangler.log vinext build");
  assert.equal(packageJson.scripts["test:e2e"], "playwright test");
  assert.equal(packageJson.devDependencies["@playwright/test"], "1.62.1");
});
