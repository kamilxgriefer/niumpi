import type { FrameManifest } from "./NiumpiFrameMachine.ts";

const MANIFEST_URL = "/assets/niumpi/frame-animation/manifest.json";
let manifestPromise: Promise<FrameManifest> | null = null;
const atlasPromises = new Map<string, Promise<HTMLImageElement>>();

export function loadFrameManifest(): Promise<FrameManifest> {
  manifestPromise ??= fetch(MANIFEST_URL, { cache: "force-cache" }).then(async (response) => {
    if (!response.ok) throw new Error(`Niumpi animation manifest ${response.status}`);
    return response.json() as Promise<FrameManifest>;
  });
  return manifestPromise;
}

export function preloadFrameAtlas(variant: string, source: string): Promise<HTMLImageElement> {
  const cached = atlasPromises.get(variant);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (typeof image.decode === "function") image.decode().then(() => resolve(image), () => resolve(image));
      else resolve(image);
    };
    image.onerror = () => reject(new Error(`Niumpi atlas failed to load: ${source}`));
    image.src = source;
  });
  atlasPromises.set(variant, promise);
  return promise;
}

export function clearFrameAssetCacheForTests() {
  manifestPromise = null;
  atlasPromises.clear();
}
