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
  const semantic = root?.dataset.anim ?? "idle";
  if (semantic === "pet" || semantic === "petting" || semantic === "tickle") return "tap_reaction";
  if (semantic === "asleep" || semantic === "sleepy") return "sleep";
  if (semantic === "floating" || semantic === "float") return "hover";
  if (semantic === "dancing") return "dance";
  if (semantic === "singing") return "sing";
  if (semantic === "peek" || semantic === "ponder") return "look";
  if (["idle", "blink", "look", "tap_reaction", "happy", "walk", "hover", "land", "sad",
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
    let visible = true;
    let activeClip: BlenderAnimationClip = entrance ? "hatch_complete" : forcedClip ?? "idle";
    let clipStartedAt = performance.now();
    let lastMotionToken = "";
    let lastReportedFrame = -1;

    const root = canvas.closest<HTMLElement>(".rig-root");
    const chooseClip = (next: BlenderAnimationClip) => {
      if (next === activeClip && !forcedClip) return;
      activeClip = next;
      clipStartedAt = performance.now();
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
        const manifest = await manifestResponse.json() as BlenderManifest;
        if (disposed) {
          disposeObject(gltf.scene, THREE);
          return;
        }
        if (manifest.renderer !== "blender-gltf" || !manifest.variants.includes(variant)) {
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
            if ("envMapIntensity" in material) (material as ThreeTypes.MeshStandardMaterial).envMapIntensity = 0.72;
          }
        });
        scene.add(model);

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
          const token = root.dataset.motionToken ?? `state:${root.dataset.anim ?? "idle"}`;
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
            const clip = manifest.clips[activeClip] ?? manifest.clips.idle;
            const elapsed = Math.max(0, (now - clipStartedAt) / 1_000);
            if (!clip.loop && elapsed >= clip.durationSeconds && !forcedClip) {
              activeClip = "idle";
              clipStartedAt = now;
            }
            const current = manifest.clips[activeClip] ?? manifest.clips.idle;
            const activeElapsed = Math.max(0, (now - clipStartedAt) / 1_000);
            const local = current.loop
              ? activeElapsed % current.durationSeconds
              : Math.min(activeElapsed, current.durationSeconds - 1 / manifest.fps);
            mixer?.setTime(current.startSeconds + local);
            renderer?.render(scene, camera!);
            const frame = Math.floor(local * OUTPUT_FPS);
            canvas.dataset.clip = activeClip;
            canvas.dataset.frame = String(frame);
            canvas.dataset.fps = String(OUTPUT_FPS);
            canvas.dataset.renderer = "blender-gltf";
            canvas.dataset.blender = manifest.blenderVersion;
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
