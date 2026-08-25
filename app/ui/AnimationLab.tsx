"use client";

import { useCallback, useMemo, useState } from "react";
import { NiumpiFrameCanvas, type BlenderAnimationClip } from "./niumpi/NiumpiFrameCanvas.tsx";
import { NIUMPI_ANIMATION_CLIPS, NIUMPI_MODEL_VARIANTS } from "../anim/NiumpiModelVariants.ts";


function fallbackFor(variant: string): string {
  return variant.startsWith("stage-")
    ? `/assets/niumpi/stages/${variant}.webp`
    : `/assets/niumpi/forms/${variant}.webp`;
}

export function AnimationLab() {
  const [variant, setVariant] = useState("stage-1");
  const [clip, setClip] = useState<BlenderAnimationClip>("idle");
  const [dark, setDark] = useState(true);
  const [stats, setStats] = useState({ frame: 0, clip: "idle" as BlenderAnimationClip, fps: 60 });
  const fallback = useMemo(() => fallbackFor(variant), [variant]);
  const reportFrame = useCallback((frame: number, active: BlenderAnimationClip, fps: number) => {
    setStats((previous) => previous.frame === frame && previous.clip === active && previous.fps === fps
      ? previous
      : { frame, clip: active, fps });
  }, []);

  return (
    <section className={`animation-lab ${dark ? "is-dark" : "is-light"}`}>
      <header className="animation-lab-head">
        <div>
          <p className="eyebrow">Niumpi character studio</p>
          <h1>Blender-authored 3D performances</h1>
          <p>One coherent pearl-cloud body, 16 authored performances and smooth real-time interpolation at 60 FPS.</p>
        </div>
        <button className="ghost-button" type="button" onClick={() => { window.location.href = "/"; }}>
          Back to game
        </button>
      </header>

      <div className="animation-lab-stage">
        <NiumpiFrameCanvas
          key={`${variant}:${clip}`}
          variant={variant}
          fallback={fallback}
          forcedClip={clip}
          onFrame={reportFrame}
        />
      </div>

      <dl className="animation-lab-stats" aria-live="polite">
        <div><dt>Variant</dt><dd>{variant}</dd></div>
        <div><dt>Clip</dt><dd>{stats.clip}</dd></div>
        <div><dt>Frame</dt><dd>{stats.frame + 1}</dd></div>
        <div><dt>FPS</dt><dd>{stats.fps}</dd></div>
      </dl>

      <div className="animation-lab-controls">
        <label>
          Evolution
          <select value={variant} onChange={(event) => setVariant(event.target.value)}>
            {NIUMPI_MODEL_VARIANTS.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
        </label>
        <div className="animation-lab-buttons" aria-label="Animation clips">
          {NIUMPI_ANIMATION_CLIPS.map((entry) => (
            <button key={entry} className={clip === entry ? "is-active" : ""} type="button" onClick={() => setClip(entry)}>
              {entry.replace("_", " ")}
            </button>
          ))}
        </div>
        <button className="ghost-button" type="button" onClick={() => setDark((value) => !value)}>
          {dark ? "Light background" : "Dark background"}
        </button>
      </div>
    </section>
  );
}
