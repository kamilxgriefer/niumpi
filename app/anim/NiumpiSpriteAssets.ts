import { validateSpriteManifest, type NiumpiSpriteManifest } from "./NiumpiSpriteRuntime.ts";
import type { NiumpiModelVariant } from "./NiumpiModelVariants.ts";

export const NIUMPI_SPRITE_ROOT = "/assets/niumpi/v2";
export const PRODUCTION_SPRITE_VARIANT: NiumpiModelVariant = "baby";

// A single 4096² RGBA atlas decodes to 64 MiB. A byte budget, rather than an
// entry count, keeps one full page plus a smaller recovery page hot without
// silently retaining three full pages (~192 MiB) on a mobile browser.
export const MAX_GLOBAL_ATLAS_DECODED_BYTES = 96 * 1024 * 1024;
export const SPRITE_ASSET_FAILURE_BACKOFF_MS = 750;

type AtlasEntry = {
  promise: Promise<HTMLImageElement>;
  image: HTMLImageElement | null;
  bytes: number;
  refs: number;
  lastUsed: number;
  discardWhenSettled: boolean;
  purgeWhenReleased: boolean;
};

type AssetFailure = { error: Error; failedAt: number };

const manifestCache = new Map<string, Promise<NiumpiSpriteManifest>>();
const manifestFailures = new Map<string, AssetFailure>();
const manifestReloads = new Map<string, Promise<NiumpiSpriteManifest>>();
const atlasCache = new Map<string, AtlasEntry>();
const atlasFailures = new Map<string, AssetFailure>();
let retainedDecodedBytes = 0;

function now() {
  return performance.now();
}

function latchedFailure(cache: Map<string, AssetFailure>, key: string): Error | null {
  const failure = cache.get(key);
  if (!failure) return null;
  if (now() - failure.failedAt < SPRITE_ASSET_FAILURE_BACKOFF_MS) return failure.error;
  cache.delete(key);
  return null;
}

export function spriteManifestFingerprint(manifest: NiumpiSpriteManifest): string {
  const pages = Object.entries(manifest.clips).flatMap(([clipName, clip]) => {
    if (!clip) return [];
    const atlasPages = "pages" in clip.atlas ? clip.atlas.pages : [clip.atlas];
    return atlasPages.map((page, index) => `${clipName}:${index}:${page.src}:${page.sha256 ?? "no-sha"}`);
  });
  return `${manifest.schemaVersion}:${manifest.variant}:${pages.sort().join("|")}`;
}

export function spriteRecoveryAdvancesGeneration(
  staleManifest: NiumpiSpriteManifest | null,
  recoveredManifest: NiumpiSpriteManifest,
): boolean {
  return staleManifest === null
    || spriteManifestFingerprint(recoveredManifest) !== spriteManifestFingerprint(staleManifest);
}

function disposeImage(image: HTMLImageElement | null) {
  if (!image) return;
  image.onload = null;
  image.onerror = null;
  // Removing the resource URL releases the browser's decoded backing store.
  // The optional call keeps the cache unit-testable with a small Image stub.
  (image as HTMLImageElement & { removeAttribute?: (name: string) => void }).removeAttribute?.("src");
}

function evict(src: string, entry: AtlasEntry) {
  if (atlasCache.get(src) !== entry || entry.refs > 0 || !entry.image) return false;
  atlasCache.delete(src);
  retainedDecodedBytes = Math.max(0, retainedDecodedBytes - entry.bytes);
  disposeImage(entry.image);
  entry.image = null;
  entry.bytes = 0;
  return true;
}

function pruneAtlasCache() {
  if (retainedDecodedBytes <= MAX_GLOBAL_ATLAS_DECODED_BYTES) return;
  const candidates = [...atlasCache.entries()]
    .filter(([, entry]) => entry.refs === 0 && entry.image)
    .sort((left, right) => left[1].lastUsed - right[1].lastUsed);
  for (const [src, entry] of candidates) {
    if (retainedDecodedBytes <= MAX_GLOBAL_ATLAS_DECODED_BYTES) break;
    evict(src, entry);
  }
}

export function spriteManifestUrl(variant: NiumpiModelVariant = PRODUCTION_SPRITE_VARIANT) {
  return `${NIUMPI_SPRITE_ROOT}/${variant}/manifest.json`;
}

function fetchSpriteManifest(
  variant: NiumpiModelVariant,
  cacheMode: RequestCache = "default",
): Promise<NiumpiSpriteManifest> {
  const url = spriteManifestUrl(variant);
  const failure = cacheMode === "default" ? latchedFailure(manifestFailures, url) : null;
  if (failure) return Promise.reject(failure);
  let pending = manifestCache.get(url);
  if (!pending) {
    pending = fetch(url, { cache: cacheMode })
      .then((response) => {
        if (!response.ok) throw new Error(`Niumpi manifest failed (${response.status})`);
        return response.json();
      })
      .then(validateSpriteManifest)
      .then((manifest) => {
        if (manifest.variant !== variant) throw new Error(`Niumpi manifest variant mismatch: ${manifest.variant}`);
        manifestFailures.delete(url);
        return manifest;
      })
      .catch((reason: unknown) => {
        const error = reason instanceof Error ? reason : new Error("Niumpi manifest failed");
        manifestFailures.set(url, { error, failedAt: now() });
        if (manifestCache.get(url) === pending) manifestCache.delete(url);
        throw error;
      });
    manifestCache.set(url, pending);
  }
  return pending;
}

export function loadSpriteManifest(variant: NiumpiModelVariant = PRODUCTION_SPRITE_VARIANT): Promise<NiumpiSpriteManifest> {
  return fetchSpriteManifest(variant);
}

/**
 * Clears one variant's stale manifest/pages and performs the sole cache-bypass
 * reload used by the mounted player. The player owns the retry count; this API
 * never recursively retries and therefore cannot become a deploy-time loop.
 */
export function reloadSpriteManifest(
  variant: NiumpiModelVariant,
  staleManifest: NiumpiSpriteManifest | null = null,
): Promise<NiumpiSpriteManifest> {
  const url = spriteManifestUrl(variant);
  const active = manifestReloads.get(url);
  if (active) return active;

  const recover = async () => {
    const cached = manifestCache.get(url);
    if (cached) {
      try {
        const current = await cached;
        if (!staleManifest || spriteManifestFingerprint(current) !== spriteManifestFingerprint(staleManifest)) return current;
      } catch {
        // The controlled cache-bypass below replaces the latched failure.
      }
    }
    invalidateSpriteVariant(variant);
    return fetchSpriteManifest(variant, "reload");
  };
  const pending = recover();
  manifestReloads.set(url, pending);
  void pending.then(
    () => { if (manifestReloads.get(url) === pending) manifestReloads.delete(url); },
    () => { if (manifestReloads.get(url) === pending) manifestReloads.delete(url); },
  );
  return pending;
}

/**
 * Acquires one shared atlas reference. Callers must pair a successful or
 * pending acquisition with `releaseSpriteAtlas`; an unmounted player may
 * release before decode completes, in which case the late image is discarded.
 */
export function loadSpriteAtlas(src: string, expectedDecodedBytes = 0): Promise<HTMLImageElement> {
  const failure = latchedFailure(atlasFailures, src);
  if (failure) return Promise.reject(failure);
  const cached = atlasCache.get(src);
  if (cached) {
    cached.refs += 1;
    cached.lastUsed = performance.now();
    cached.discardWhenSettled = false;
    return cached.promise;
  }

  let resolveImage!: (image: HTMLImageElement) => void;
  let rejectImage!: (error: Error) => void;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    resolveImage = resolve;
    rejectImage = reject;
  });
  const entry: AtlasEntry = {
    promise,
    image: null,
    bytes: 0,
    refs: 1,
    lastUsed: performance.now(),
    discardWhenSettled: false,
    purgeWhenReleased: false,
  };
  atlasCache.set(src, entry);

  const image = new Image();
  image.decoding = "async";
  image.onload = () => {
    const decoded = typeof image.decode === "function" ? image.decode().catch(() => undefined) : Promise.resolve();
    void decoded.then(() => {
      // Cache clear or a dispose-before-decode must not resurrect a stale page.
      if (atlasCache.get(src) !== entry || entry.discardWhenSettled || entry.refs === 0) {
        if (atlasCache.get(src) === entry) atlasCache.delete(src);
        disposeImage(image);
        resolveImage(image);
        return;
      }
      entry.image = image;
      entry.bytes = expectedDecodedBytes > 0
        ? expectedDecodedBytes
        : Math.max(0, image.naturalWidth * image.naturalHeight * 4);
      entry.lastUsed = performance.now();
      retainedDecodedBytes += entry.bytes;
      atlasFailures.delete(src);
      pruneAtlasCache();
      resolveImage(image);
    });
  };
  image.onerror = () => {
    if (atlasCache.get(src) === entry) atlasCache.delete(src);
    disposeImage(image);
    const error = new Error(`Niumpi atlas failed: ${src}`);
    atlasFailures.set(src, { error, failedAt: now() });
    rejectImage(error);
  };
  image.src = src;
  return promise;
}

export function releaseSpriteAtlas(src: string) {
  const entry = atlasCache.get(src);
  if (!entry) return;
  entry.refs = Math.max(0, entry.refs - 1);
  entry.lastUsed = performance.now();
  if (entry.refs === 0 && !entry.image) entry.discardWhenSettled = true;
  if (entry.refs === 0 && entry.purgeWhenReleased && entry.image) {
    evict(src, entry);
    return;
  }
  pruneAtlasCache();
}

/** Mark every page owned by a stale variant for disposal without invalidating
 * an image still being drawn by the old effect during React teardown. */
export function invalidateSpriteVariant(variant: NiumpiModelVariant) {
  const manifestUrl = spriteManifestUrl(variant);
  manifestCache.delete(manifestUrl);
  manifestFailures.delete(manifestUrl);
  const variantSegment = `${NIUMPI_SPRITE_ROOT}/${variant}/`;
  for (const [src, entry] of atlasCache) {
    if (!src.includes(variantSegment)) continue;
    atlasFailures.delete(src);
    if (entry.refs === 0 && entry.image) evict(src, entry);
    else if (entry.refs === 0) {
      entry.discardWhenSettled = true;
      atlasCache.delete(src);
    } else entry.purgeWhenReleased = true;
  }
  for (const src of atlasFailures.keys()) {
    if (src.includes(variantSegment)) atlasFailures.delete(src);
  }
}

export function spriteAtlasCacheStatsForTests() {
  return {
    entries: atlasCache.size,
    pending: [...atlasCache.values()].filter((entry) => !entry.image).length,
    activeReferences: [...atlasCache.values()].reduce((total, entry) => total + entry.refs, 0),
    retainedDecodedBytes,
    budgetBytes: MAX_GLOBAL_ATLAS_DECODED_BYTES,
  };
}

export function clearSpriteAssetCacheForTests() {
  manifestCache.clear();
  manifestFailures.clear();
  manifestReloads.clear();
  for (const entry of atlasCache.values()) disposeImage(entry.image);
  atlasCache.clear();
  atlasFailures.clear();
  retainedDecodedBytes = 0;
}
