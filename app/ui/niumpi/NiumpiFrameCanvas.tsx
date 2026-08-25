"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { onMotionChange, prefersReducedMotion } from "../../anim/motionPrefs.ts";
import {
  CONTINUOUS_DURATIONS,
  CONTINUOUS_FPS,
  motionFrameAtTime,
  sampleContinuousMotion,
} from "../../anim/NiumpiContinuousMotion.ts";
import { NiumpiSoftRenderer } from "../../anim/NiumpiSoftRenderer.ts";
import {
  frameStateForRoot,
  NiumpiFrameMachine,
  type FrameClip,
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
    let resizeObserver: ResizeObserver | null = null;
    let renderer: NiumpiSoftRenderer | null = null;
    let machine: NiumpiFrameMachine;
    let activeToken = -1;
    let lastFrame = -1;
    let lastReportedFrame = -1;
    let behaviorStartedAt = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setReady(false);
    if (reducedMotion) return;

    const resizeBackingStore = () => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(48, Math.min(640, Math.round(bounds.width * pixelRatio)));
      const height = Math.max(48, Math.min(640, Math.round(bounds.height * pixelRatio)));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      canvas.dataset.buffer = `${width}x${height}`;
    };

    resizeBackingStore();
    resizeObserver = new ResizeObserver(resizeBackingStore);
    resizeObserver.observe(canvas);

    const start = async () => {
      try {
        const image = new window.Image();
        image.decoding = "async";
        image.src = fallback;
        await image.decode();
        if (disposed) return;
        renderer = new NiumpiSoftRenderer(canvas, image);
        const initialState = forcedClip
          ? STATE_FOR_CLIP[forcedClip]
          : entrance ? "ENTERING" : "IDLE";
        const startedAt = performance.now();
        behaviorStartedAt = startedAt;
        machine = new NiumpiFrameMachine(initialState, startedAt, CONTINUOUS_DURATIONS);
        setReady(true);

        const root = canvas.closest<HTMLElement>(".rig-root");
        let lastRootToken = "";
        const requestFromRoot = () => {
          if (!root || forcedClip || entrance) return;
          const rootToken = root.dataset.motionToken ?? `state:${root.dataset.anim ?? "idle"}`;
          if (rootToken === lastRootToken) return;
          lastRootToken = rootToken;
          behaviorStartedAt = performance.now();
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
          const clip = forcedClip ?? snapshot.clip;
          const elapsed = forcedClip
            ? (now - startedAt) % CONTINUOUS_DURATIONS[forcedClip]
            : now - snapshot.enteredAt;
          const behavior = forcedClip ?? root?.dataset.anim ?? clip;
          const index = motionFrameAtTime(clip, elapsed);
          if (index !== lastFrame || snapshot.token !== activeToken) {
            const motionElapsed = forcedClip ? elapsed : now - behaviorStartedAt;
            renderer?.draw(sampleContinuousMotion(clip, motionElapsed, behavior), now / 1_000);
            canvas.dataset.clip = clip;
            canvas.dataset.frame = String(index);
            canvas.dataset.fps = String(CONTINUOUS_FPS);
            canvas.dataset.renderer = "continuous-soft-mesh";
            if (lastReportedFrame < 0 || Math.abs(index - lastReportedFrame) >= 3) {
              onFrame?.(index, clip, CONTINUOUS_FPS);
              lastReportedFrame = index;
            }
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
      resizeObserver?.disconnect();
      if (frameRequest) window.cancelAnimationFrame(frameRequest);
      renderer?.dispose();
    };
  }, [entrance, fallback, forcedClip, onFrame, reducedMotion, variant]);

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
