"use client";

import { useCallback, useMemo, useState } from "react";
import type { FrameClip } from "../anim/NiumpiFrameMachine.ts";
import { NiumpiFrameCanvas } from "./niumpi/NiumpiFrameCanvas.tsx";

const VARIANTS = [
  "stage-1", "stage-2", "stage-3", "stage-4", "stage-5",
  "moonveil", "bloomheart", "sparkleap", "mistwander", "prismatic",
];
const CLIPS: FrameClip[] = ["idle", "blink", "look", "tap_reaction", "happy", "hatch_complete"];

function fallbackFor(variant: string): string {
  return variant.startsWith("stage-")
    ? `/assets/niumpi/stages/${variant}.webp`
    : `/assets/niumpi/forms/${variant}.webp`;
}

export function AnimationLab() {
  const [variant, setVariant] = useState("stage-1");
  const [clip, setClip] = useState<FrameClip>("idle");
  const [dark, setDark] = useState(true);
  const [stats, setStats] = useState({ frame: 0, clip: "idle" as FrameClip, fps: 60 });
  const fallback = useMemo(() => fallbackFor(variant), [variant]);
  const reportFrame = useCallback((frame: number, active: FrameClip, fps: number) => {
    setStats((previous) => previous.frame === frame && previous.clip === active && previous.fps === fps
      ? previous
      : { frame, clip: active, fps });
  }, []);

  return (
    <section className={`animation-lab ${dark ? "is-dark" : "is-light"}`}>
      <header className="animation-lab-head">
        <div>
          <p className="eyebrow">Niumpi animation lab</p>
          <h1>Continuous soft-body motion</h1>
          <p>One painted character, smoothly deformed at 60 FPS. No pose switching and no visible joints.</p>
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
            {VARIANTS.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
        </label>
        <div className="animation-lab-buttons" aria-label="Animation clips">
          {CLIPS.map((entry) => (
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
