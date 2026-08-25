"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type * as ThreeTypes from "three";
import { onMotionChange, prefersReducedMotion } from "../../anim/motionPrefs.ts";
import type { BlenderAnimationClip, BlenderManifest } from "../../anim/NiumpiModelVariants.ts";
export type { BlenderAnimationClip } from "../../anim/NiumpiModelVariants.ts";

type Props = {
  variant: string;
  fallback: string;
  entrance?: boolean;
  forcedClip?: BlenderAnimationClip;
  onFrame?: (frame: number, clip: BlenderAnimationClip, fps: number) => void;
};

const OUTPUT_FPS = 60;
const MODEL_ROOT = "/assets/niumpi/models";

function clipForRoot(root: HTMLElement | null): BlenderAnimationClip {
  if (root?.classList.contains("behavior-eating-favorite")) return "eat_favorite";
  if (root?.classList.contains("behavior-eating")) return "eat";
  if (root?.classList.contains("is-blinking")) return "blink";
  const semantic = root?.dataset.anim ?? "idle";
  if (semantic === "pet" || semantic === "petting" || semantic === "tickle") return "tap_reaction";
  if (semantic === "asleep" || semantic === "sleepy") return "sleep";
  if (semantic === "floating" || semantic === "float") return "hover";
  if (semantic === "dancing") return "dance";
  if (semantic === "singing") return "sing";
  if (semantic === "peek" || semantic === "ponder") return "look";
  if (["idle", "blink", "look", "tap_reaction", "happy", "eat", "eat_favorite", "walk", "hover", "land", "sad",
    "sleep", "dance", "sing", "read", "lamp", "roll"].includes(semantic)) return semantic as BlenderAnimationClip;
  if (root?.classList.contains("behavior-petting") || root?.classList.contains("behavior-tickle")) return "tap_reaction";
  if (root?.classList.contains("behavior-dance")) return "dance";
  if (root?.classList.contains("behavior-sing")) return "sing";
  if (root?.classList.contains("behavior-peek") || root?.classList.contains("behavior-ponder")) return "look";
  return "idle";
}

function disposeObject(object: ThreeTypes.Object3D, THREE: typeof import("three")) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}

const FOOD_COLOURS: Record<string, { fruit: number; accent: number }> = {
  moonberry: { fruit: 0x8e65e8, accent: 0x76e0c2 },
  cloudpuff: { fruit: 0xfff9ef, accent: 0xc5eafb },
  dewdrop: { fruit: 0x58d9df, accent: 0xb9f7f2 },
  sunseed: { fruit: 0xffc653, accent: 0xff846d },
  heartberry: { fruit: 0xf06991, accent: 0x8ce0a4 },
  dreammint: { fruit: 0x9c8ce8, accent: 0x8de1c3 },
  starmush: { fruit: 0xb889ed, accent: 0xffda76 },
  emberfruit: { fruit: 0xf27858, accent: 0xffcd65 },
  frostpetal: { fruit: 0x9de8f0, accent: 0xd9f6ff },
  honeydew: { fruit: 0xf2c96f, accent: 0x9ed39a },
  gigglenut: { fruit: 0xb77954, accent: 0xf7a7bf },
  tidepearl: { fruit: 0x7ddbd2, accent: 0xc8f2ff },
  auroraleaf: { fruit: 0x8edfd0, accent: 0xcb9bed },
  rootcandy: { fruit: 0xe89968, accent: 0x8bd07b },
};

function smoothStep(from: number, to: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

/**
 * Browser player for the Blender-authored Niumpi performance timeline.
 *
 * Blender owns modelling, materials, pivots, easing and every animation pose.
 * The browser only seeks through those authored curves and renders the real 3D
 * scene at the display refresh rate; there is no DOM puppet and no frame atlas.
 */
export function NiumpiFrameCanvas({ variant, fallback, entrance = false, forcedClip, onFrame }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const applyPreference = () => setReducedMotion(prefersReducedMotion());
    applyPreference();
    return onMotionChange(applyPreference);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setReady(false);
    canvas.dataset.variant = variant;
    if (reducedMotion) return;

    // Tiny neighbour portraits keep the approved still image. This avoids
    // creating several WebGL contexts for 56px thumbnails while the playable
    // creature remains fully 3D everywhere it can actually be interacted with.
    if (canvas.closest(".friend-avatar")) {
      canvas.dataset.renderer = "portrait-fallback";
      return;
    }

    let disposed = false;
    let frameRequest = 0;
    let mutationObserver: MutationObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    let threeModule: typeof import("three") | null = null;
    let renderer: ThreeTypes.WebGLRenderer | null = null;
    let camera: ThreeTypes.PerspectiveCamera | null = null;
    let model: ThreeTypes.Object3D | null = null;
    let mixer: ThreeTypes.AnimationMixer | null = null;
    let foodProp: ThreeTypes.Group | null = null;
    let foodMaterial: ThreeTypes.MeshPhysicalMaterial | null = null;
    let foodAccentMaterial: ThreeTypes.MeshPhysicalMaterial | null = null;
    let manifest: BlenderManifest | null = null;
    let visible = true;
    let activeClip: BlenderAnimationClip = entrance ? "hatch_complete" : forcedClip ?? "idle";
    let queuedClip: BlenderAnimationClip | null = null;
    let clipStartedAt = performance.now();
    let lastMotionToken = "";
    let lastReportedFrame = -1;
    const ambientClips = new Set<BlenderAnimationClip>(["idle", "blink", "look", "walk", "hover", "land"]);

    const root = canvas.closest<HTMLElement>(".rig-root");
    const chooseClip = (next: BlenderAnimationClip) => {
      if (next === activeClip && !forcedClip) return;
      const current = manifest?.clips[activeClip];
      const unfinished = current && !current.loop
        && performance.now() - clipStartedAt < current.durationSeconds * 1_000;
      // Controllers describe gameplay state and may enter recovery or schedule
      // a blink before a Blender performance reaches its final keyed pose.
      // Ambient motion waits in the wings; a new explicit performance can
      // still interrupt immediately when the player asks for another action.
      if (unfinished && ambientClips.has(next)) {
        if (next === "idle") queuedClip = next;
        return;
      }
      activeClip = next;
      clipStartedAt = performance.now();
      queuedClip = null;
      lastReportedFrame = -1;
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(48, Math.round(bounds.width));
      const height = Math.max(48, Math.round(bounds.height));
      if (renderer) {
        const qualityCap = width < 160 ? 320 : 960;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2, qualityCap / width, qualityCap / height);
        renderer.setPixelRatio(Math.max(1, pixelRatio));
        renderer.setSize(width, height, false);
        if (camera) {
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        }
      } else {
        canvas.width = Math.min(640, Math.round(width * Math.min(window.devicePixelRatio || 1, 2)));
        canvas.height = Math.min(640, Math.round(height * Math.min(window.devicePixelRatio || 1, 2)));
      }
      canvas.dataset.buffer = `${canvas.width}x${canvas.height}`;
    };
    resize();
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    intersectionObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { rootMargin: "120px" });
    intersectionObserver.observe(canvas);

    const start = async () => {
      try {
        const [manifestResponse, THREE, gltf] = await Promise.all([
          fetch(`${MODEL_ROOT}/manifest.json`),
          import("three"),
          import("three/examples/jsm/loaders/GLTFLoader.js")
            .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(`${MODEL_ROOT}/${variant}.glb`)),
        ]);
        threeModule = THREE;
        if (!manifestResponse.ok) throw new Error("Niumpi animation manifest is unavailable");
        const loadedManifest = await manifestResponse.json() as BlenderManifest;
        manifest = loadedManifest;
        if (disposed) {
          disposeObject(gltf.scene, THREE);
          return;
        }
        if (loadedManifest.renderer !== "blender-gltf" || !loadedManifest.variants.includes(variant)) {
          throw new Error(`Niumpi Blender variant ${variant} is missing`);
        }

        const scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(31, 1, 0.1, 30);
        camera.position.set(0, 1.48, 6.35);
        camera.lookAt(0, 1.48, 0);

        renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
          premultipliedAlpha: true,
        });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.18;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        resize();

        const hemisphere = new THREE.HemisphereLight(0xfdf8ff, 0x35205b, 2.15);
        const key = new THREE.DirectionalLight(0xffffff, 3.8);
        key.position.set(-3.2, 5.5, 5.2);
        key.castShadow = true;
        key.shadow.mapSize.set(512, 512);
        key.shadow.camera.left = -3;
        key.shadow.camera.right = 3;
        key.shadow.camera.top = 4;
        key.shadow.camera.bottom = -1;
        const fill = new THREE.DirectionalLight(0x9fe9ff, 1.7);
        fill.position.set(3.8, 2.2, 4.2);
        const rim = new THREE.DirectionalLight(0xc6a4ff, 1.4);
        rim.position.set(0, 4.2, -4);
        scene.add(hemisphere, key, fill, rim);

        model = gltf.scene;
        model.position.y = -0.04;
        model.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          child.castShadow = true;
          child.receiveShadow = true;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of materials) {
            if (material.name.startsWith("ReferenceArtwork_")) {
              const painted = material as ThreeTypes.MeshStandardMaterial;
              // The approved illustration is the colour authority. Keep the
              // Blender mesh deformation, but do not relight or tone-map the
              // pearlescent painting into a grey plastic object.
              // The exported material carries the same texture as base colour
              // and emissive for glTF portability. Render it once through the
              // emissive channel; adding both would wash the pearl painting to
              // flat white.
              painted.color.set(0x000000);
              painted.transparent = true;
              painted.alphaTest = 0.012;
              painted.depthWrite = false;
              painted.side = THREE.DoubleSide;
              painted.toneMapped = false;
              if (painted.map) {
                painted.emissive.set(0xffffff);
                painted.emissiveMap = painted.map;
                painted.emissiveIntensity = 1;
              }
              child.castShadow = false;
              child.receiveShadow = false;
              continue;
            }
            if ("envMapIntensity" in material) (material as ThreeTypes.MeshStandardMaterial).envMapIntensity = 0.72;
          }
        });
        scene.add(model);

        // The food stays separate from the reference-locked character art.
        // It approaches the mouth and visibly loses three bites while the
        // Blender-authored body performs anticipation, chewing and recovery.
        foodProp = new THREE.Group();
        foodProp.name = "NiumpiFoodPerformanceProp";
        foodMaterial = new THREE.MeshPhysicalMaterial({
          color: 0x8e65e8,
          roughness: 0.42,
          metalness: 0,
          clearcoat: 0.42,
          clearcoatRoughness: 0.35,
        });
        foodAccentMaterial = new THREE.MeshPhysicalMaterial({
          color: 0x76e0c2,
          roughness: 0.5,
          metalness: 0,
          clearcoat: 0.25,
        });
        const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.17, 28, 20), foodMaterial);
        fruit.scale.set(1.04, 0.94, 0.88);
        const accent = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), foodAccentMaterial);
        accent.position.set(0.08, 0.15, 0.01);
        accent.scale.set(0.62, 1.2, 0.42);
        accent.rotation.z = -0.55;
        fruit.castShadow = true;
        accent.castShadow = true;
        foodProp.add(fruit, accent);
        foodProp.visible = false;
        scene.add(foodProp);

        const shadow = new THREE.Mesh(
          new THREE.CircleGeometry(0.92, 48),
          new THREE.ShadowMaterial({ color: 0x24103f, opacity: 0.2 }),
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set(0, 0.025, 0.15);
        shadow.receiveShadow = true;
        scene.add(shadow);

        mixer = new THREE.AnimationMixer(model);
        for (const animation of gltf.animations) mixer.clipAction(animation).play();
        // The browser owns the clock and seeks explicitly. Keep the mixer at
        // normal scale: AnimationMixer.setTime() evaluates through update(),
        // which would otherwise be multiplied by zero and leave a frozen pose.
        mixer.timeScale = 1;

        const requestFromRoot = () => {
          if (!root || forcedClip || entrance) return;
          const token = `${root.dataset.motionToken ?? `state:${root.dataset.anim ?? "idle"}`}:blink:${root.classList.contains("is-blinking") ? 1 : 0}`;
          if (token === lastMotionToken) return;
          lastMotionToken = token;
          chooseClip(clipForRoot(root));
        };
        if (root) {
          mutationObserver = new MutationObserver(requestFromRoot);
          mutationObserver.observe(root, { attributes: true, attributeFilter: ["data-anim", "data-motion-token", "class"] });
          requestFromRoot();
        }

        const draw = (now: number) => {
          if (disposed) return;
          if (visible) {
            const clip = loadedManifest.clips[activeClip] ?? loadedManifest.clips.idle;
            const elapsed = Math.max(0, (now - clipStartedAt) / 1_000);
            if (!clip.loop && elapsed >= clip.durationSeconds && !forcedClip) {
              activeClip = queuedClip ?? "idle";
              queuedClip = null;
              clipStartedAt = now;
              lastReportedFrame = -1;
            }
            const current = loadedManifest.clips[activeClip] ?? loadedManifest.clips.idle;
            const activeElapsed = Math.max(0, (now - clipStartedAt) / 1_000);
            const local = current.loop
              ? activeElapsed % current.durationSeconds
              : Math.min(activeElapsed, current.durationSeconds - 1 / loadedManifest.fps);
            mixer?.setTime(current.startSeconds + local);

            if (foodProp && foodMaterial && foodAccentMaterial) {
              const eating = activeClip === "eat" || activeClip === "eat_favorite";
              const progress = current.durationSeconds > 0 ? local / current.durationSeconds : 0;
              foodProp.visible = eating && progress < 0.72;
              if (foodProp.visible) {
                const id = root?.dataset.actionProp ?? "moonberry";
                const colours = FOOD_COLOURS[id] ?? FOOD_COLOURS.moonberry;
                foodMaterial.color.setHex(colours.fruit);
                foodAccentMaterial.color.setHex(colours.accent);
                const approach = smoothStep(0.05, 0.31, progress);
                const chewOne = smoothStep(0.34, 0.39, progress);
                const chewTwo = smoothStep(0.46, 0.51, progress);
                const chewThree = smoothStep(0.58, 0.64, progress);
                const bites = chewOne + chewTwo + chewThree;
                const baseScale = Math.max(0.12, 1 - bites * 0.27);
                const sniff = Math.sin(progress * Math.PI * 18) * 0.025 * (1 - approach);
                foodProp.position.set(
                  1.42 + (0.18 - 1.42) * approach,
                  1.18 + (1.08 - 1.18) * approach + sniff,
                  0.48,
                );
                foodProp.rotation.z = -0.18 + approach * 0.26 + Math.sin(progress * 24) * 0.035;
                foodProp.scale.setScalar(baseScale * (1 + Math.sin(progress * 40) * 0.025));
              }
            }
            renderer?.render(scene, camera!);
            const frame = Math.floor(local * OUTPUT_FPS);
            canvas.dataset.clip = activeClip;
            canvas.dataset.frame = String(frame);
            canvas.dataset.fps = String(OUTPUT_FPS);
            canvas.dataset.renderer = "blender-gltf";
            canvas.dataset.blender = loadedManifest.blenderVersion;
            if (lastReportedFrame < 0 || Math.abs(frame - lastReportedFrame) >= 3) {
              onFrame?.(frame, activeClip as BlenderAnimationClip, OUTPUT_FPS);
              lastReportedFrame = frame;
            }
          }
          frameRequest = window.requestAnimationFrame(draw);
        };
        draw(performance.now());
        setReady(true);
      } catch (error) {
        if (!disposed) canvas.dataset.error = error instanceof Error ? error.message : "Blender animation load failed";
      }
    };

    void start();
    return () => {
      disposed = true;
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      if (frameRequest) window.cancelAnimationFrame(frameRequest);
      if (model && threeModule) disposeObject(model, threeModule);
      if (foodProp && threeModule) disposeObject(foodProp, threeModule);
      mixer?.stopAllAction();
      renderer?.dispose();
    };
  }, [entrance, forcedClip, onFrame, reducedMotion, variant]);

  return (
    <span
      className={`nb-frame-player ${ready ? "is-ready" : "is-loading"} ${reducedMotion ? "is-reduced" : ""}`}
      data-variant={variant}
    >
      <Image className="nb-frame-fallback" src={fallback} alt="" fill sizes="330px" unoptimized draggable={false} />
      <canvas ref={canvasRef} className="nb-frame-canvas" width={320} height={320} aria-hidden="true" />
    </span>
  );
}
