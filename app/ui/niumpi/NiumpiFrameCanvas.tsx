"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { loadFrameManifest, preloadFrameAtlas } from "../../anim/NiumpiFrameAssets.ts";
import { onMotionChange, prefersReducedMotion } from "../../anim/motionPrefs.ts";
import {
  frameIndexAtTime,
  frameStateForRoot,
  NiumpiFrameMachine,
  type FrameClip,
  type FrameManifest,
  type FrameState,
} from "../../anim/NiumpiFrameMachine.ts";

type Props = {
  variant: string;
  fallback: string;
  entrance?: boolean;
  forcedClip?: FrameClip;
  onFrame?: (frame: number, clip: FrameClip, fps: number) => void;
};

const STATE_FOR_CLIP: Record<FrameClip, FrameState> = {
  hatch_complete: "ENTERING",
  idle: "IDLE",
  blink: "BLINKING",
  look: "LOOKING",
  tap_reaction: "REACTING",
  happy: "HAPPY",
};

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
    let disposed = false;
    let frameRequest = 0;
    let observer: MutationObserver | null = null;
    let manifest: FrameManifest;
    let atlas: HTMLImageElement;
    let machine: NiumpiFrameMachine;
    let activeToken = -1;
    let lastFrame = -1;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setReady(false);
    if (reducedMotion) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    const start = async () => {
      try {
        manifest = await loadFrameManifest();
        const asset = manifest.variants[variant] ?? manifest.variants["stage-1"];
        atlas = await preloadFrameAtlas(variant, asset.atlas);
        if (disposed) return;
        const durations = Object.fromEntries(
          Object.entries(manifest.clips).map(([name, clip]) => [name, clip.durationMs]),
        ) as Record<FrameClip, number>;
        const initialState = forcedClip
          ? STATE_FOR_CLIP[forcedClip]
          : entrance ? "ENTERING" : "IDLE";
        machine = new NiumpiFrameMachine(initialState, performance.now(), durations);
        setReady(true);

        const root = canvas.closest<HTMLElement>(".rig-root");
        let lastRootToken = "";
        const requestFromRoot = () => {
          if (!root || forcedClip || entrance) return;
          const rootToken = root.dataset.motionToken ?? `state:${root.dataset.anim ?? "idle"}`;
          if (rootToken === lastRootToken) return;
          lastRootToken = rootToken;
          const next = frameStateForRoot(root);
          machine.request(next, performance.now());
        };
        if (root) {
          observer = new MutationObserver(requestFromRoot);
          observer.observe(root, { attributes: true, attributeFilter: ["data-anim", "data-motion-token"] });
          requestFromRoot();
        }

        const draw = (now: number) => {
          if (disposed) return;
          const snapshot = machine.advance(now);
          const clip = manifest.clips[forcedClip ?? snapshot.clip];
          const index = frameIndexAtTime(clip, now - snapshot.enteredAt);
          if (index !== lastFrame || snapshot.token !== activeToken) {
            const source = clip.frames[index];
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(
              atlas,
              source.x, source.y, source.w, source.h,
              0, 0, canvas.width, canvas.height,
            );
            canvas.dataset.clip = forcedClip ?? snapshot.clip;
            canvas.dataset.frame = String(index);
            canvas.dataset.fps = String(clip.fps);
            onFrame?.(index, forcedClip ?? snapshot.clip, clip.fps);
            lastFrame = index;
            activeToken = snapshot.token;
          }
          frameRequest = window.requestAnimationFrame(draw);
        };
        // The first atlas frame is available before the first scheduled paint.
        draw(performance.now());
      } catch (error) {
        if (!disposed) canvas.dataset.error = error instanceof Error ? error.message : "animation load failed";
      }
    };

    void start();
    return () => {
      disposed = true;
      observer?.disconnect();
      if (frameRequest) window.cancelAnimationFrame(frameRequest);
    };
  }, [entrance, forcedClip, onFrame, reducedMotion, variant]);

  return (
    <span
      className={`nb-frame-player ${ready ? "is-ready" : "is-loading"} ${reducedMotion ? "is-reduced" : ""}`}
      data-variant={variant}
    >
      <Image className="nb-frame-fallback" src={fallback} alt="" fill sizes="330px" unoptimized draggable={false} />
      <canvas ref={canvasRef} className="nb-frame-canvas" width={224} height={224} aria-hidden="true" />
    </span>
  );
}
