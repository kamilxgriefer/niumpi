import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import test from "node:test";

const PUBLIC_ROOT = join(process.cwd(), "public");
const TEMP_ATLAS_DIRECTORY = /^\.atlas-build-/;
const SOURCE_FRAME = /^\d{4,6}\.(?:png|webp|exr)$/i;
const SOURCE_ONLY_SEGMENTS = new Set(["rendered-source", "_qa"]);

type ManifestAtlasPage = {
  src: string;
  width: number;
  height: number;
  decodedBytes?: number;
  sha256?: string;
};

function publicAssetIssues(root: string): string[] {
  const issues: string[] = [];

  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const publicPath = relative(root, path).split(sep).join("/");

      if (entry.isDirectory()) {
        if (TEMP_ATLAS_DIRECTORY.test(entry.name)) {
          issues.push(`${publicPath}: temporary atlas build directory`);
          continue;
        }
        if (SOURCE_ONLY_SEGMENTS.has(entry.name)) {
          issues.push(`${publicPath}: rendered source directory`);
          continue;
        }
        visit(path);
        continue;
      }

      if (!entry.isFile()) continue;
      if (statSync(path).size === 0) issues.push(`${publicPath}: zero-byte asset`);
      if (SOURCE_FRAME.test(entry.name) || entry.name === "render-report.json") {
        issues.push(`${publicPath}: rendered source frame or report`);
      }
    }
  };

  visit(root);
  return issues.sort();
}

function webpDimensions(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 20 || bytes.toString("ascii", 0, 4) !== "RIFF"
    || bytes.toString("ascii", 8, 12) !== "WEBP") throw new Error("invalid RIFF/WebP header");
  let cursor = 12;
  while (cursor + 8 <= bytes.length) {
    const kind = bytes.toString("ascii", cursor, cursor + 4);
    const size = bytes.readUInt32LE(cursor + 4);
    const data = cursor + 8;
    if (data + size > bytes.length) throw new Error(`truncated ${kind} chunk`);
    if (kind === "VP8X" && size >= 10) {
      return { width: 1 + bytes.readUIntLE(data + 4, 3), height: 1 + bytes.readUIntLE(data + 7, 3) };
    }
    if (kind === "VP8L" && size >= 5 && bytes[data] === 0x2f) {
      const packed = bytes.readUInt32LE(data + 1);
      return { width: 1 + (packed & 0x3fff), height: 1 + ((packed >>> 14) & 0x3fff) };
    }
    if (kind === "VP8 " && size >= 10
      && bytes[data + 3] === 0x9d && bytes[data + 4] === 0x01 && bytes[data + 5] === 0x2a) {
      return {
        width: bytes.readUInt16LE(data + 6) & 0x3fff,
        height: bytes.readUInt16LE(data + 8) & 0x3fff,
      };
    }
    cursor = data + size + (size % 2);
  }
  throw new Error("WebP has no supported dimensions chunk");
}

function manifestAssetIssues(root: string): string[] {
  const issues: string[] = [];
  const spriteRoot = join(root, "assets/niumpi/v2");
  if (!existsSync(spriteRoot)) return ["assets/niumpi/v2: missing sprite root"];
  for (const variant of readdirSync(spriteRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const manifestPath = join(spriteRoot, variant.name, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      schemaVersion?: number;
      clips?: Record<string, { atlas?: Partial<ManifestAtlasPage> & { pages?: ManifestAtlasPage[] } }>;
      provenance?: { sha256?: Record<string, string> };
    };
    for (const [clipName, clip] of Object.entries(manifest.clips ?? {})) {
      if (!clip.atlas) continue;
      const pages: Array<Partial<ManifestAtlasPage>> = clip.atlas.pages ?? [clip.atlas];
      pages.forEach((page, pageIndex) => {
        if (!page.src) return issues.push(`${variant.name}/${clipName}:${pageIndex}: missing atlas src`);
        const path = page.src.startsWith("/")
          ? join(root, page.src.slice(1))
          : join(dirname(manifestPath), page.src);
        if (!existsSync(path)) return issues.push(`${variant.name}/${clipName}:${pageIndex}: missing WebP`);
        try {
          const bytes = readFileSync(path);
          const actualHash = createHash("sha256").update(bytes).digest("hex");
          const expectedHash = page.sha256 ?? manifest.provenance?.sha256?.[`${clipName}:${pageIndex}`];
          if (manifest.schemaVersion === 3 && !page.sha256) {
            issues.push(`${variant.name}/${clipName}:${pageIndex}: v3 page missing full sha256`);
          }
          if (!expectedHash || actualHash !== expectedHash) {
            issues.push(`${variant.name}/${clipName}:${pageIndex}: full sha256 mismatch`);
          }
          const dimensions = webpDimensions(bytes);
          if (dimensions.width !== page.width || dimensions.height !== page.height) {
            issues.push(`${variant.name}/${clipName}:${pageIndex}: WebP dimensions mismatch`);
          }
          const actualDecodedBytes = dimensions.width * dimensions.height * 4;
          if (manifest.schemaVersion === 3 && page.decodedBytes === undefined) {
            issues.push(`${variant.name}/${clipName}:${pageIndex}: v3 page missing decodedBytes`);
          }
          if (page.decodedBytes !== undefined && page.decodedBytes !== actualDecodedBytes) {
            issues.push(`${variant.name}/${clipName}:${pageIndex}: decodedBytes mismatch`);
          }
        } catch (error) {
          issues.push(`${variant.name}/${clipName}:${pageIndex}: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    }
  }
  return issues.sort();
}

test("public contains only deployable assets, never interrupted atlases or render sources", () => {
  assert.deepEqual(publicAssetIssues(PUBLIC_ROOT), []);
});

test("every referenced WebP matches full provenance hash, dimensions and decoded-byte metadata", () => {
  assert.deepEqual(manifestAssetIssues(PUBLIC_ROOT), []);
});
