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

async function source(file: string): Promise<string> {
  return readFile(new URL(`../${file}`, import.meta.url), "utf8");
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

test("the character scales with its container instead of fixed pixels", async () => {
  const rig = await css("rig.css");
  assert.match(rig, /\.rig-root \{[^}]*container-type: size/);
  // The body is one SVG in a viewBox, so every feature scales together. What
  // still has to be fluid is the box it is drawn into.
  assert.match(rig, /\.rig-root \{[^}]*width: clamp\([^)]*cqw/);
  assert.doesNotMatch(rig, /\.nb \{[^}]*width: \d+px/);
});

test("shading is clipped to the silhouette so a route cannot bleed outside it", async () => {
  const body = await source("app/ui/niumpi/NiumpiBody.tsx");
  // The belly and rim light are drawn from the same path as the body, then
  // clipped to it. Without the clip they spill past the outline at the stages
  // where the silhouette narrows.
  assert.match(body, /<clipPath id="nb-silhouette">/);
  assert.match(body, /clipPath="url\(#nb-silhouette\)"/);

  const rig = await css("rig.css");
  for (const route of ["moonveil", "bloomheart", "sparkleap", "mistwander", "prismatic"]) {
    // Every route must restyle the creature through custom properties only —
    // a route that set geometry would break the growth model.
    assert.match(rig, new RegExp(`\\.body-${route}\\s*\\{[^}]*--skin-mid:`), `missing palette for ${route}`);
  }
});

test("the keyboard body zones never intercept pointer gestures", async () => {
  const rig = await css("rig.css");
  // These invisible buttons exist only as keyboard alternatives. If they take
  // pointer events they sit on top of the creature and swallow taps, drags and
  // holds aimed at it.
  assert.match(rig, /\.rig-zones \{[^}]*pointer-events: none/);
  assert.match(rig, /\.rig-zone \{[^}]*pointer-events: none/);
  assert.doesNotMatch(rig, /\.rig-zone \{[^}]*pointer-events: auto/);
  // They must still be reachable and visible when focused.
  assert.match(rig, /\.rig-zone:focus-visible \{/);
});
