import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

type WorkerModule = {
  default: {
    fetch(request: Request, env: unknown, ctx: unknown): Promise<Response>;
  };
};

async function render(): Promise<Response> {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = (await import(workerUrl.href)) as WorkerModule;

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

let cached: Promise<string> | undefined;
function html(): Promise<string> {
  cached ??= render().then(async (response) => {
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
    return response.text();
  });
  return cached;
}

async function css(file: string): Promise<string> {
  return readFile(new URL(`../app/styles/${file}`, import.meta.url), "utf8");
}

test("the persistent shell server-renders as real markup, not a spinner", async () => {
  const page = await html();
  for (const region of ["shell", "cosmic", "rail", "rail-tab", "bottom-nav", "scene-host", "brand-name"]) {
    assert.ok(page.includes(region), `missing region: ${region}`);
  }
});

test("every navigation tab is present in the documented order", async () => {
  const page = await html();
  const labels = ["Home", "Niumpi", "Room", "Memory", "Garden", "Games", "Shop"];
  let cursor = -1;
  for (const label of labels) {
    const at = page.indexOf(`rail-label">${label}<`);
    assert.ok(at > -1, `missing rail tab: ${label}`);
    assert.ok(at > cursor, `rail tab out of order: ${label}`);
    cursor = at;
  }
});

test("keeps the repository spelling of the game name", async () => {
  const page = await html();
  assert.match(page, /class="logo-i"/);
  assert.doesNotMatch(page, /NiumPi/);
  assert.doesNotMatch(page, /NiumPI/);
});

test("no panel from the previous single-screen layout survives", async () => {
  const page = await html();
  for (const legacy of ["pet-room", "needs-panel", "memory-note", "food-tray", "room-controls", "care-signature", "app-frame"]) {
    assert.ok(!page.includes(legacy), `legacy markup still rendered: ${legacy}`);
  }
});

test("the document declares a manifest, theme colour and viewport-fit", async () => {
  const page = await html();
  assert.match(page, /rel="manifest"/);
  assert.match(page, /name="theme-color"/);
  assert.match(page, /viewport-fit=cover/);
});

test("the stylesheet ships cosmic design tokens rather than scattered literals", async () => {
  const tokens = await css("tokens.css");
  for (const token of ["--cosmic:", "--violet:", "--turquoise:", "--r-pill:", "--shadow-md:", "--s-4:", "--t-sm:", "--ease:", "--tap:"]) {
    assert.ok(tokens.includes(token), `missing design token: ${token}`);
  }
});

test("motion, safe areas and touch targets are handled in CSS", async () => {
  const responsive = await css("responsive.css");
  assert.match(responsive, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(responsive, /env\(safe-area-inset-bottom\)/);
  const tokens = await css("tokens.css");
  const tap = tokens.match(/--tap:\s*(\d+)px/);
  assert.ok(tap && Number(tap[1]) >= 44, "touch target token must be at least 44px");
});

test("the character scales with its container instead of fixed leaf pixels", async () => {
  const rig = await css("rig.css");
  assert.match(rig, /\.rig-root \{[^}]*container-type: size/);
  assert.match(rig, /\.rig-leaf \{[^}]*width: 14\.2cqw/);
  assert.doesNotMatch(rig, /\.rig-leaf \{[^}]*width: 54px/);
});

test("recolour layers are masked to the body so a route cannot bleed outside it", async () => {
  const rig = await css("rig.css");
  assert.match(rig, /mask-image: var\(--body-mask\)/);
  for (const route of ["moonveil", "bloomheart", "sparkleap", "mistwander", "prismatic"]) {
    // Selectors in this file are column-aligned, so whitespace is not fixed.
    assert.match(rig, new RegExp(`\\.body-${route}\\s+\\.layer-tint`), `missing tint layer for ${route}`);
  }
});
