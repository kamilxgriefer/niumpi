import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

let cached;
async function html() {
  cached ??= await render().then(async (response) => {
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
    return response.text();
  });
  return cached;
}

test("server-renders the whole game screen in one frame", async () => {
  const page = await html();
  for (const region of [
    "app-frame",
    "app-header",
    "stage-grid",
    "speech-bubble",
    "stats-card",
    "room-window",
    "companion-card",
    "growth-card",
    "personality-banner",
    "interaction-hint",
    "snack-bar",
    "action-bar",
  ]) {
    assert.ok(page.includes(region), `missing region: ${region}`);
  }
});

test("keeps the repository spelling of the game name", async () => {
  const page = await html();
  assert.match(page, /class="logo-i"/);
  assert.doesNotMatch(page, /NiumPi/);
});

test("no panel from the previous layout is left behind", async () => {
  const page = await html();
  for (const legacy of ["pet-room", "needs-panel", "memory-note", "food-tray", "room-controls", "care-signature"]) {
    assert.ok(!page.includes(legacy), `legacy markup still rendered: ${legacy}`);
  }
});

test("needs and bond are exposed as progress bars, not colour alone", async () => {
  const page = await html();
  const bars = page.match(/role="progressbar"/g) ?? [];
  assert.ok(bars.length >= 4, `expected bond plus three needs, found ${bars.length}`);
  for (const need of ["Fullness", "Energy", "Joy"]) {
    assert.ok(page.includes(need), `missing need: ${need}`);
  }
  assert.match(page, /aria-valuenow="\d+"/);
});

test("every treat is a real button that also works without dragging", async () => {
  const page = await html();
  for (const treat of ["Moonberry", "Cloud puff", "Dewdrop"]) {
    assert.ok(page.includes(treat), `missing treat: ${treat}`);
  }
  assert.match(page, /class="snack-card[^"]*"[^>]*type="button"|type="button"[^>]*class="snack-card/);
  assert.match(page, /aria-pressed="false"/);
});

test("room actions and sound keep their labels and pressed state", async () => {
  const page = await html();
  assert.ok(page.includes("Lamp on"));
  assert.ok(page.includes("Tuck in"));
  assert.match(page, /class="sound-toggle is-on"[^>]*aria-pressed="true"/);
  assert.ok(page.includes("Tap, hold, pet, or touch the leaf"));
});

test("the stylesheet ships design tokens instead of scattered literals", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  for (const token of ["--ink:", "--coral:", "--teal:", "--r-pill:", "--shadow-md:", "--s-4:", "--t-sm:", "--ease:"]) {
    assert.ok(css.includes(token), `missing design token: ${token}`);
  }
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

test("the character scales with the stage instead of fixed leaf pixels", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.rig-root \{[^}]*container-type: size/);
  assert.match(css, /\.rig-leaf \{[^}]*width: 14\.2cqw/);
  assert.doesNotMatch(css, /\.rig-leaf \{[^}]*width: 54px/);
});
