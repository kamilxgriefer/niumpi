"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fallbackForVariant,
  NIUMPI_MODEL_VARIANTS,
  type NiumpiAnimationClip,
} from "../anim/NiumpiModelVariants.ts";
import { loadSpriteManifest } from "../anim/NiumpiSpriteAssets.ts";
import { manifestSpriteClips, type NiumpiSpriteManifest } from "../anim/NiumpiSpriteRuntime.ts";
import { NiumpiFrameCanvas, type FramePlayerSnapshot } from "./niumpi/NiumpiFrameCanvas.tsx";

type LabBackground = "dark" | "light" | "checker";

const EMPTY_STATS: Pick<FramePlayerSnapshot, "frame" | "totalFrames" | "fps" | "state" | "clip" | "loop" | "motionGate"> = {
  frame: 0,
  totalFrames: 1,
  fps: 24,
  state: "IDLE",
  clip: "idle",
  loop: true,
  motionGate: "FAIL",
};

export function AnimationLab() {
  const [variant, setVariant] = useState<(typeof NIUMPI_MODEL_VARIANTS)[number]>("baby");
  const [clip, setClip] = useState<NiumpiAnimationClip>("idle");
  const [background, setBackground] = useState<LabBackground>("dark");
  const [playing, setPlaying] = useState(true);
  const [loop, setLoop] = useState(true);
  const [restartToken, setRestartToken] = useState(0);
  const [scrubFrame, setScrubFrame] = useState<number | null>(null);
  const [showAnchor, setShowAnchor] = useState(false);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [catalog, setCatalog] = useState<{
    variant: typeof variant;
    manifest: NiumpiSpriteManifest | null;
    clips: NiumpiAnimationClip[];
  }>({ variant: "baby", manifest: null, clips: ["idle"] });
  const labManifest = catalog.variant === variant ? catalog.manifest : null;
  const animationClips: NiumpiAnimationClip[] = catalog.variant === variant ? catalog.clips : ["idle"];
  const fallback = useMemo(() => fallbackForVariant(variant), [variant]);

  useEffect(() => {
    let current = true;
    void loadSpriteManifest(variant).then((loaded) => {
      if (!current) return;
      const present = manifestSpriteClips(loaded);
      setCatalog({ variant, manifest: loaded, clips: present });
      setClip((selected) => present.includes(selected) ? selected : "idle");
    }).catch(() => {
      if (current) setCatalog({ variant, manifest: null, clips: ["idle"] });
    });
    return () => { current = false; };
  }, [variant]);

  const reportFrame = useCallback((next: FramePlayerSnapshot) => {
    setStats((previous) => (
      previous.frame === next.frame && previous.clip === next.clip && previous.state === next.state
      && previous.totalFrames === next.totalFrames && previous.fps === next.fps && previous.loop === next.loop
        ? previous
        : next
    ));
  }, []);

  const selectClip = (next: NiumpiAnimationClip) => {
    setClip(next);
    setScrubFrame(null);
    setPlaying(true);
    setLoop(labManifest?.clips[next]?.loop ?? next === "idle");
  };

  const step = (delta: number) => {
    setPlaying(false);
    setScrubFrame((current) => {
      const base = current ?? stats.frame;
      return Math.max(0, Math.min(stats.totalFrames - 1, base + delta));
    });
  };

  const togglePlayback = () => {
    if (!playing && stats.frame >= stats.totalFrames - 1 && scrubFrame == null) setRestartToken((value) => value + 1);
    setScrubFrame(null);
    setPlaying((value) => !value);
  };

  return (
    <section className={`animation-lab is-${background}`}>
      <header className="animation-lab-head">
        <div>
          <p className="eyebrow">Niumpi animation lab</p>
          <h1>Production sprite player</h1>
          <p>The same manifest, state machine, atlas cache and Canvas renderer used in the real game.</p>
        </div>
        <button className="ghost-button" type="button" onClick={() => { window.location.href = "/"; }}>
          Back to game
        </button>
      </header>

      <div className="animation-lab-workspace">
        <div className="animation-lab-preview">
          <div className="animation-lab-stage" data-background={background}>
            <NiumpiFrameCanvas
              variant={variant}
              fallback={fallback}
              forcedClip={clip}
              playing={playing}
              restartToken={restartToken}
              frameOverride={scrubFrame}
              loopOverride={loop}
              showAnchor={showAnchor}
              onFrame={reportFrame}
            />
          </div>

          <div className="animation-lab-transport" aria-label="Playback controls">
            <button type="button" onClick={() => step(-1)} aria-label="Previous frame">←</button>
            <button className="is-primary" type="button" onClick={togglePlayback}>{playing ? "Pause" : "Play"}</button>
            <button type="button" onClick={() => step(1)} aria-label="Next frame">→</button>
            <button type="button" onClick={() => { setScrubFrame(null); setRestartToken((value) => value + 1); }}>Restart</button>
          </div>

          <label className="animation-lab-timeline">
            <span>Timeline</span>
            <input
              type="range"
              min="0"
              max={Math.max(0, stats.totalFrames - 1)}
              value={scrubFrame ?? stats.frame}
              onChange={(event) => {
                setPlaying(false);
                setScrubFrame(Number(event.target.value));
              }}
              aria-label="Animation frame"
            />
            <output>{stats.frame + 1} / {stats.totalFrames}</output>
          </label>
        </div>

        <aside className="animation-lab-panel" aria-label="Animation settings">
          <label>
            Evolution
            <select value={variant} onChange={(event) => {
              const next = event.target.value as typeof variant;
              setVariant(next);
              selectClip("idle");
            }}>
              {NIUMPI_MODEL_VARIANTS.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
            </select>
          </label>

          <fieldset>
            <legend>Clip</legend>
            <div className="animation-lab-buttons">
              {animationClips.map((entry) => (
                <button key={entry} className={clip === entry ? "is-active" : ""} type="button" onClick={() => selectClip(entry)}>
                  {entry.replaceAll("_", " ")}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Background</legend>
            <div className="animation-lab-segmented">
              {(["dark", "light", "checker"] as LabBackground[]).map((value) => (
                <button key={value} type="button" className={background === value ? "is-active" : ""} onClick={() => setBackground(value)}>{value}</button>
              ))}
            </div>
          </fieldset>

          <label className="animation-lab-check"><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} /> Loop clip</label>
          <label className="animation-lab-check"><input type="checkbox" checked={showAnchor} onChange={(event) => setShowAnchor(event.target.checked)} /> Show foot anchor</label>

          <dl className="animation-lab-stats" aria-live="polite">
            <div><dt>State</dt><dd>{stats.state}</dd></div>
            <div><dt>Clip</dt><dd>{stats.clip}</dd></div>
            <div><dt>Frame</dt><dd>{stats.frame + 1} / {stats.totalFrames}</dd></div>
            <div><dt>FPS</dt><dd>{stats.fps}</dd></div>
            <div><dt>Motion gate</dt><dd data-motion-gate={stats.motionGate}>{stats.motionGate}</dd></div>
            <div><dt>Renderer</dt><dd>Canvas atlas v{labManifest?.schemaVersion ?? "…"}</dd></div>
          </dl>
        </aside>
      </div>
    </section>
  );
}
