"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, PointerEvent, ReactNode } from "react";
import { NiumpiRenderer } from "./NiumpiRenderer";
import { visualStageFor } from "../game/config/growth.ts";
import type { BodyPart } from "./NiumpiRenderer";
import { Art } from "./Art";
import { useGame } from "./GameProvider";
import { useNiumpiController } from "../anim/useNiumpiController";
import { gesture, toggleLamp, wake } from "../game/actions";
import { moodFor, moodTable } from "../game/mood";
import { dayPartAt } from "../game/time";
import { sparkStyle } from "./parts";
import type { CareActionId } from "../game/types";
import type { AnimState } from "../anim/NiumpiAnimationController";
import { learnedRoomLine } from "../game/behavior";
import type { RoomMomentId } from "../game/behavior";
import { chooseLine, rememberLine } from "../game/reactions";
import { resolveRigAppearance } from "../rig/appearance.ts";
import type { BehaviorMood } from "../anim/NiumpiBehaviorMachine.ts";

/** Held longer than this counts as a hug rather than a tap. */
const HOLD_MS = 620;
/** Dragged further than this counts as petting. */
const PET_DISTANCE = 30;
/** A fast back-and-forth drag reads as tickling. */
const TICKLE_REVERSALS = 3;
const ROOM_MOMENTS: Array<{
  state: RoomMomentId; x: number; y: number; gazeX: number; gazeY: number;
  line: string; sound: "blip" | "leaf" | "tap" | "pet" | "chime";
}> = [
  { state: "book", x: -76, y: 2, gazeX: -12, gazeY: -6, line: "This one has a map inside.", sound: "blip" },
  { state: "window", x: 76, y: -3, gazeX: 14, gazeY: -8, line: "Something moved past the window…", sound: "leaf" },
  { state: "lamp", x: 84, y: 5, gazeX: 12, gazeY: 5, line: "A little warmer. That's better.", sound: "tap" },
  { state: "roll", x: 0, y: 8, gazeX: 0, gazeY: 5, line: "Wheee— I meant to do that!", sound: "pet" },
  { state: "dancing", x: 0, y: 0, gazeX: 0, gazeY: -2, line: "One, two… leaf turn!", sound: "chime" },
  { state: "singing", x: 0, y: -2, gazeX: 0, gazeY: -4, line: "Nium… niuuum…", sound: "chime" },
  { state: "peek", x: 34, y: 0, gazeX: 9, gazeY: -2, line: "Just checking what you're doing.", sound: "blip" },
  { state: "stretch", x: 0, y: -2, gazeX: 0, gazeY: -5, line: "Tiny stretch. Big day.", sound: "blip" },
];

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
  const { state, now, run, patch, message, controller, say, cue, clock } = useGame();
  const rigRef = useNiumpiController(controller);
  const pointer = useRef<{ at: number; x: number; y: number; distance: number; dir: number; flips: number } | null>(null);
  const lastMoment = useRef<RoomMomentId | null>(null);
  const latestState = useRef(state);
  const [roomMoment, setRoomMoment] = useState<AnimState>("idle");

  const mood = moodFor(state, now);
  const name = state.niumpi.name || "Niumpi";
  const visualStage = visualStageFor(state.niumpi.careMoments, state.niumpi.stage);
  const rigAppearance = resolveRigAppearance({
    ...state,
    niumpi: { ...state.niumpi, stage: visualStage },
  });
  const leafInfo = moodTable[mood];

  useEffect(() => { latestState.current = state; }, [state]);

  /* The controller owns rest state; React only tells it when sleep flips. */
  useEffect(() => {
    controller.setRest(state.niumpi.sleeping ? "asleep" : "idle");
  }, [controller, state.niumpi.sleeping]);

  useEffect(() => {
    const behaviorMood: BehaviorMood = state.niumpi.sleeping ? "sleeping" : ({
      excited: "excited",
      happy: "happy",
      tired: "tired",
      hungry: "sad",
      curious: "curious",
      upset: "sad",
      dreaming: "calm",
      evolving: "excited",
    } as const)[mood];
    controller.setBehaviorContext({
      mood: behaviorMood,
      energy: state.stats.energy / 100,
      joy: state.stats.joy / 100,
      curiosity: state.stats.curiosity / 100,
      playfulness: Math.min(1, state.evolution.vectors.playful / 40),
    });
  }, [
    controller, mood, state.niumpi.sleeping, state.stats.energy, state.stats.joy,
    state.stats.curiosity, state.evolution.vectors.playful,
  ]);

  useEffect(() => {
    controller.setTargeted(targeting);
  }, [controller, targeting]);

  useEffect(() => {
    const unsubscribe = controller.subscribeState((next) => {
      setRoomMoment(next);
      if (next === "idle") {
        controller.setPosition(0, 0);
        controller.setGaze(0, 0);
      }
    });
    // subscribeState hands back Set.delete, which returns a boolean — an effect
    // cleanup has to return void, so call it rather than hand it straight back.
    return () => { unsubscribe(); };
  }, [controller]);

  const playRoomMoment = useCallback((moment: RoomMomentId, announce = true) => {
    const current = latestState.current;
    if (current.niumpi.sleeping || controller.getState() !== "idle") return;
    const scene = ROOM_MOMENTS.find((entry) => entry.state === moment);
    if (!scene) return;
    lastMoment.current = moment;
    controller.setPosition(scene.x, scene.y);
    controller.setGaze(scene.gazeX, scene.gazeY);
    controller.request(scene.state);
    if (moment === "lamp" && !current.niumpi.lampOn) run(toggleLamp(current));
    if (announce) say(learnedRoomLine(current, clock(), moment, scene.line));
    cue(scene.sound);
  }, [clock, controller, cue, run, say]);

  /* The motion director owns autonomous movement. This independent, slower
   * timer only chooses dialogue, so two schedulers can never fight over pose. */
  useEffect(() => {
    if (state.niumpi.sleeping) return;
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (controller.getState() === "idle") {
          const line = chooseLine(latestState.current, clock());
          patch((current) => rememberLine(current, line.id));
          say(line.text);
        }
        schedule();
      }, 10_000 + Math.random() * 8_000);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [clock, controller, patch, say, state.niumpi.sleeping]);

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
        `room-moment-${roomMoment}`,
        compact ? "is-compact" : "",
      ].filter(Boolean).join(" ")}
      onPointerMove={follow}
    >
      <div className="room-back" aria-hidden="true">
        <span className="room-wall" />
        <span className="room-glow" />
        <span className="room-window">
          <span className="window-sky" />
          <span className="window-orb" />
          <span className="window-hill hill-back" />
          <span className="window-hill hill-front" />
          <span className="window-weather" />
          <span className="window-bar" />
          <span className="window-sill" />
        </span>
        <span className="room-frame"><i /></span>
        <span className="room-shelf"><i /><i /><i /><i /><b /></span>
        {/* Floor first: furniture standing on it must paint afterwards. */}
        <span className="room-rail" />
        <span className="room-floor" />
        <span className="room-rug"><i /></span>
        <span className="room-cushion" />
        <span className="room-plant"><i /><i /><i /><b /></span>
        <span className="room-lamp"><i /><b /></span>
      </div>

      <nav className="room-hotspots" aria-label="Things Niumpi can explore">
        <button className="room-hotspot hotspot-books" type="button" onClick={() => playRoomMoment("book")}>
          <Art name="book" size={15} /><span>Books</span>
        </button>
        <button className="room-hotspot hotspot-window" type="button" onClick={() => playRoomMoment("window")}>
          <Art name="window" size={15} /><span>Window</span>
        </button>
        <button className="room-hotspot hotspot-lamp" type="button" onClick={() => playRoomMoment("lamp")}>
          <Art name="lamp" size={15} /><span>Lamp</span>
        </button>
        <button className="room-hotspot hotspot-rug" type="button" onClick={() => playRoomMoment("roll")}>
          <Art name="playful" size={15} /><span>Roll</span>
        </button>
      </nav>

      <div className="room-moment-props" aria-hidden="true">
        <span className="moment-book"><i /><i /></span>
        <span className="moment-window-spark"><i /></span>
        <span className="moment-lamp-spark">✦</span>
        <span className="moment-notes"><i>♪</i><i>♫</i><i>·</i></span>
        <span className="moment-roll-puff"><i /><i /><i /></span>
      </div>

      {showBubble && (
        <div className="speech-bubble" key={message}>
          <span className="speech-speaker">{name}</span>
          <span className="speech-message">
            <p className="speech-text" aria-live="polite" aria-atomic="true">{message}</p>
            <Art name="spark" size={13} className="speech-spark" />
          </span>
          <span className="speech-trail" aria-hidden="true"><i /><i /><i /></span>
        </div>
      )}

      <div className="pet-stage">
        <span className="pet-shadow" aria-hidden="true" />
        <span className="sleep-nest" aria-hidden="true" />
        <NiumpiRenderer
          rigRef={rigRef}
          phenotype={state.phenotype}
          appearance={rigAppearance}
          stage={visualStage}
          cleanliness={state.niumpi.cleanliness}
          washTool={state.niumpi.lastWashTool}
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

export type { CSSProperties };
