import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("the root route mounts the Niumpi game", async () => {
  const page = await read("app/page.tsx");

  // The game now mounts as a provider plus a persistent shell rather than a
  // single scene component.
  assert.match(page, /import \{ GameProvider \} from "\.\/ui\/GameProvider"/);
  assert.match(page, /import \{ GameShell \} from "\.\/ui\/GameShell"/);
  assert.match(page, /<GameProvider>/);
  assert.match(page, /<GameShell \/>/);
  assert.match(page, /title:\s*`\$\{copy\.brand\.name\}/);
});

test("the care scene keeps a versioned save and accessible controls", async () => {
  const [state, persistence, renderer, stage, home, snacks] = await Promise.all([
    read("app/game/state.ts"),
    read("app/game/persistence.ts"),
    read("app/ui/NiumpiRenderer.tsx"),
    read("app/ui/CompanionStage.tsx"),
    read("app/scenes/HomeScene.tsx"),
    read("app/ui/SnackBar.tsx"),
  ]);

  // The save is versioned and older keys are still migrated forward.
  assert.match(state, /export const SAVE_VERSION = \d+/);
  assert.match(state, /export const STORAGE_KEY = "niumpi-save-v4"/);
  assert.match(state, /LEGACY_KEYS = \["niumpi-memory-v3", "niumpi-memory-v2", "niumpi-memory-v1"\]/);
  assert.match(persistence, /window\.localStorage\.setItem\(STORAGE_KEY/);
  assert.match(persistence, /window\.localStorage\.getItem\(STORAGE_KEY\)/);

  // The creature stays reachable by name, and its leaf is a real control.
  assert.match(renderer, /aria-label=\{`Pet \$\{petName\}`\}/);
  assert.match(renderer, /aria-label=\{`Touch \$\{petName\}'s mood leaf`\}/);
  assert.match(stage, /aria-live="polite"/);

  // Toggles report their state rather than relying on styling alone.
  assert.match(home, /aria-pressed=\{state\.niumpi\.lampOn\}/);
  assert.match(home, /aria-pressed=\{on\}/);
  assert.match(snacks, /aria-pressed=\{selected\}/);

  // Feeding must not be drag-only.
  assert.match(snacks, /className="snack-feed"/);
});

test("quality scripts cover lint, types, build and browser tests", async () => {
  const packageJson = JSON.parse(await read("package.json"));

  assert.equal(packageJson.scripts.lint, "eslint . --ignore-pattern dist --ignore-pattern .next");
  assert.equal(packageJson.scripts.typecheck, "tsc --noEmit");
  assert.equal(packageJson.scripts.build, "WRANGLER_LOG_PATH=.wrangler/wrangler.log vinext build");
  assert.equal(packageJson.scripts["test:e2e"], "playwright test");
  assert.equal(packageJson.devDependencies["@playwright/test"], "1.62.1");
});
