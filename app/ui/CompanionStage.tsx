"use client";

import { useCallback, useEffect, useRef } from "react";
import type { CSSProperties, MouseEvent, PointerEvent, ReactNode } from "react";
import { NiumpiRenderer, visualStageFor } from "./NiumpiRenderer";
import type { BodyPart } from "./NiumpiRenderer";
import { Art } from "./Art";
import { useGame } from "./GameProvider";
import { useNiumpiController } from "../anim/useNiumpiController";
import { gesture, wake } from "../game/actions";
import { moodFor, moodTable } from "../game/mood";
import { dayPartAt } from "../game/time";
import { sparkStyle } from "./parts";
import type { CareActionId } from "../game/types";

/** Held longer than this counts as a hug rather than a tap. */
const HOLD_MS = 620;
/** Dragged further than this counts as petting. */
const PET_DISTANCE = 30;
/** A fast back-and-forth drag reads as tickling. */
const TICKLE_REVERSALS = 3;
/** How often the creature drifts to a new spot while nothing else happens. */
const WANDER_MS = 6_500;

function capture(event: PointerEvent<HTMLButtonElement>) {
  try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* capture is optional */ }
}

type Props = {
  /** Feeding target highlight, driven by the Snack Bar. */
  targeting?: boolean;
  onDropFood?: (clientX: number, clientY: number) => boolean;
  children?: ReactNode;
  compact?: boolean;
  showBubble?: boolean;
};

export function CompanionStage({ targeting = false, onDropFood, children, compact, showBubble = true }: Props) {
  const { state, now, run, message, controller, say, clock } = useGame();
  const rigRef = useNiumpiController(controller);
  const pointer = useRef<{ at: number; x: number; y: number; distance: number; dir: number; flips: number } | null>(null);
  const drift = useRef({ x: 0, y: 0 });

  const mood = moodFor(state, now);
  const name = state.niumpi.name || "Niumpi";
  const visualStage = visualStageFor(state.niumpi.careMoments, state.niumpi.stage);
  const leafInfo = moodTable[mood];

  /* The controller owns rest state; React only tells it when sleep flips. */
  useEffect(() => {
    controller.setRest(state.niumpi.sleeping ? "asleep" : "idle");
  }, [controller, state.niumpi.sleeping]);

  useEffect(() => {
    controller.setTargeted(targeting);
  }, [controller, targeting]);

  /* Idle drift: one timer, one controller call — no React state per step. */
  useEffect(() => {
    if (state.niumpi.sleeping) return;
    const timer = window.setInterval(() => {
      if (controller.getState() !== "idle") return;
      drift.current = {
        x: Math.max(-96, Math.min(96, drift.current.x + (Math.random() * 150 - 75))),
        y: Math.round(Math.random() * 10),
      };
      controller.setPosition(drift.current.x, drift.current.y);
      controller.request("wander");
    }, WANDER_MS);
    return () => window.clearInterval(timer);
  }, [controller, state.niumpi.sleeping]);

  const act = useCallback((action: CareActionId) => {
    run(gesture(state, action, clock()));
  }, [clock, run, state]);

  function begin(event: PointerEvent<HTMLButtonElement>) {
    if (state.niumpi.sleeping) { run(wake(state, clock())); return; }
    if (onDropFood && targeting) { onDropFood(event.clientX, event.clientY); return; }
    capture(event);
    pointer.current = { at: performance.now(), x: event.clientX, y: event.clientY, distance: 0, dir: 0, flips: 0 };
    controller.setPressed(true);
    controller.request("petting");
    say("Mmm…");
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const track = pointer.current;
    if (!track) return;
    const dx = event.clientX - track.x;
    track.distance += Math.hypot(dx, event.clientY - track.y);
    const direction = Math.sign(dx);
    if (direction && track.dir && direction !== track.dir) track.flips += 1;
    if (direction) track.dir = direction;
    track.x = event.clientX;
    track.y = event.clientY;
  }

  function end() {
    const track = pointer.current;
    pointer.current = null;
    controller.setPressed(false);
    if (!track) return;
    const held = performance.now() - track.at;
    if (track.flips >= TICKLE_REVERSALS) act("tickle");
    else if (track.distance > PET_DISTANCE) act("pet");
    else if (held >= HOLD_MS) act("hug");
    else act("pet");
  }

  /** Enter and Space report no pointer detail — that is the keyboard path. */
  function activate(event: MouseEvent<HTMLButtonElement>) {
    if (event.detail !== 0) return;
    if (state.niumpi.sleeping) { run(wake(state, clock())); return; }
    act("pet");
  }

  function touchLeaf() {
    if (state.niumpi.sleeping) { run(wake(state, clock())); return; }
    act("leaf");
  }

  /** Gaze goes straight to the controller — it never becomes React state. */
  function follow(event: PointerEvent<HTMLDivElement>) {
    if (moodFor(state, clock()) !== "curious" && !targeting) return;
    const box = event.currentTarget.getBoundingClientRect();
    controller.setGaze(
      Math.max(-18, Math.min(18, (event.clientX - box.left - box.width / 2) * 0.08)),
      Math.max(-10, Math.min(10, (event.clientY - box.top - box.height / 2) * 0.05)),
    );
  }

  const partActions: Record<BodyPart, CareActionId> = {
    head: "pet", belly: "tickle", side: "brush", feet: "tickle", leaf: "leaf",
  };
  const part = dayPartAt(now);

  return (
    <div
      className={[
        "companion-stage",
        `daypart-${part}`,
        `weather-${state.weather.key}`,
        state.niumpi.lampOn ? "lamp-on" : "",
        state.niumpi.sleeping ? "is-sleeping" : "",
        compact ? "is-compact" : "",
      ].filter(Boolean).join(" ")}
      onPointerMove={follow}
    >
      <div className="room-back" aria-hidden="true">
        <span className="room-wall" />
        <span className="room-window">
          <span className="window-sky" />
          <span className="window-orb" />
          <span className="window-hill hill-back" />
          <span className="window-hill hill-front" />
          <span className="window-weather" />
        </span>
        <span className="room-shelf"><i /><i /><i /></span>
        <span className="room-plant"><i /><i /><b /></span>
        <span className="room-lamp"><i /><b /></span>
        <span className="room-floor" />
        <span className="room-rug" />
      </div>

      {showBubble && (
        <div className="speech-bubble">
          <p className="speech-text" aria-live="polite">{message}</p>
          <Art name="spark" size={13} className="speech-spark" />
        </div>
      )}

      <div className="pet-stage">
        <span className="pet-shadow" aria-hidden="true" />
        <span className="sleep-nest" aria-hidden="true" />
        <NiumpiRenderer
          rigRef={rigRef}
          phenotype={state.phenotype}
          visualStage={visualStage}
          moodColour={leafInfo.colour}
          petName={name}
          onPartActivate={(bodyPart) => act(partActions[bodyPart])}
          onLeafTouch={touchLeaf}
          onActivate={activate}
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={end}
        />
        <SparkLayer />
      </div>

      <MoodLeafBadge mood={mood} onOpen={() => say(`My leaf is ${leafInfo.label.toLowerCase()} — ${leafInfo.leaf.toLowerCase()}.`)} />

      {children && <div className="stage-aside">{children}</div>}
    </div>
  );
}

/** Sparks are short-lived DOM nodes animated entirely by CSS keyframes. */
function SparkLayer() {
  const { sparks } = useGame();
  return (
    <div className="spark-layer" aria-hidden="true">
      {sparks.map((spark) => (
        <span className="love-spark" key={spark.id} style={sparkStyle(spark.offset, spark.delay)}>
          {spark.symbol}
        </span>
      ))}
    </div>
  );
}

export function MoodLeafBadge({ mood, onOpen }: { mood: string; onOpen: () => void }) {
  const { cue } = useGame();
  const info = moodTable[mood as keyof typeof moodTable];
  return (
    <button
      className={`mood-badge mood-${info.colour}`}
      type="button"
      onClick={() => { cue("blip"); onOpen(); }}
    >
      <span className={`mood-leaf motion-${info.motion}`} aria-hidden="true" />
      <span className="mood-copy">
        <strong>{info.label}</strong>
        <span>{info.leaf}</span>
      </span>
    </button>
  );
}

export type { CSSProperties };
