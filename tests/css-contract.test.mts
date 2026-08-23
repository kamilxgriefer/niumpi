import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const STYLE_DIR = new URL("../app/styles/", import.meta.url);

async function stylesheets(): Promise<Array<{ file: string; text: string }>> {
  const files = (await readdir(STYLE_DIR)).filter((f) => f.endsWith(".css"));
  return Promise.all(
    files.map(async (file) => ({ file, text: await readFile(new URL(file, STYLE_DIR), "utf8") })),
  );
}

test("every animation names a keyframe set that exists", async () => {
  // `mote-rise` was referenced by two decorative layers and defined nowhere, so
  // both rendered as motionless dots. Nothing failed and nothing warned — the
  // effect simply was not there. This is the whole class of that bug.
  const sheets = await stylesheets();
  const defined = new Set<string>();
  for (const { text } of sheets) {
    for (const match of text.matchAll(/@keyframes\s+([\w-]+)/g)) defined.add(match[1]);
  }

  const missing: string[] = [];
  for (const { file, text } of sheets) {
    for (const match of text.matchAll(/\banimation(?:-name)?\s*:\s*([^;]+);/g)) {
      const value = match[1];
      if (value.includes("var(")) continue;
      for (const token of value.split(",")) {
        // The name is the one token that is not a time, count, or keyword.
        const name = token
          .trim()
          .split(/\s+/)
          .find(
            (part) =>
              /^[a-zA-Z][\w-]*$/.test(part) &&
              !/^(infinite|alternate|alternate-reverse|reverse|normal|both|forwards|backwards|none|paused|running|linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end|steps)$/.test(part) &&
              !part.startsWith("cubic-bezier") &&
              !part.startsWith("steps"),
          );
        if (name && !defined.has(name)) missing.push(`${file}: ${name}`);
      }
    }
  }

  assert.deepEqual(missing, [], `animations with no @keyframes:\n  ${missing.join("\n  ")}`);
});

test("interactive controls meet the touch floor the product sets", async () => {
  const sheets = await stylesheets();
  const components = sheets.find((s) => s.file === "components.css");
  assert.ok(components, "components.css must exist");
  // The dismiss control on every modal was 36px. This product declares a 44px
  // minimum in its own tokens, and this is the control small hands use most.
  assert.match(components.text, /\.icon-button \{[^}]*width: var\(--tap/);
  assert.match(components.text, /\.icon-button \{[^}]*height: var\(--tap/);
});

test("a Niumpi drawn outside the full rig still has a palette", async () => {
  // The default colours used to live on .rig-root, so any body rendered
  // elsewhere — a neighbour's avatar, the cook — resolved every gradient stop
  // to nothing and painted a black silhouette. They belong at the root.
  const rig = (await stylesheets()).find((s) => s.file === "rig.css");
  assert.ok(rig, "rig.css must exist");
  for (const token of ["--skin-light", "--skin-mid", "--skin-deep", "--eye", "--leaf-light", "--foot"]) {
    assert.match(
      rig.text,
      new RegExp(`:root \\{[^}]*${token}:`),
      `${token} must have a root-level default`,
    );
  }
  assert.doesNotMatch(rig.text, /\.rig-root \{[^}]*--skin-mid:/);
});
