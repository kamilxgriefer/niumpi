"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";

export type NiumpiBehavior = "idle" | "wander" | "float" | "spin" | "curious" | "happy" | "sleepy" | "asleep";
export type CareStyle = "growing" | "playful" | "restful" | "explorer" | "affection" | "chaotic";

type Props = {
  behavior: NiumpiBehavior;
  growthStage: 1 | 2 | 3 | 4;
  careStyle: CareStyle;
  isPressed: boolean;
  position: { x: number; y: number };
  look: { x: number; y: number };
  onLeafTouch: () => void;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: () => void;
};

export function RiggedNiumpi({
  behavior,
  growthStage,
  careStyle,
  isPressed,
  position,
  look,
  onLeafTouch,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const target = useRef({ x: position.x, y: position.y, lookX: look.x, lookY: look.y });
  const spring = useRef({ x: 0, y: 0, vx: 0, vy: 0, lookX: 0, lookY: 0, vlx: 0, vly: 0 });
  const [isBlinking, setIsBlinking] = useState(false);

  useEffect(() => {
    target.current = { x: position.x, y: position.y, lookX: look.x, lookY: look.y };
  }, [look, position]);

  useEffect(() => {
    let frame = 0;
    function animate() {
      const value = spring.current;
      const destination = target.current;
      value.vx = (value.vx + (destination.x - value.x) * 0.028) * 0.84;
      value.vy = (value.vy + (destination.y - value.y) * 0.028) * 0.84;
      value.vlx = (value.vlx + (destination.lookX - value.lookX) * 0.09) * 0.72;
      value.vly = (value.vly + (destination.lookY - value.lookY) * 0.09) * 0.72;
      value.x += value.vx;
      value.y += value.vy;
      value.lookX += value.vlx;
      value.lookY += value.vly;
      if (root.current) {
        root.current.style.setProperty("--rig-x", `${value.x.toFixed(2)}px`);
        root.current.style.setProperty("--rig-y", `${value.y.toFixed(2)}px`);
        root.current.style.setProperty("--gaze-x", `${value.lookX.toFixed(2)}px`);
        root.current.style.setProperty("--gaze-y", `${value.lookY.toFixed(2)}px`);
        root.current.style.setProperty("--gaze-tilt", `${(value.lookX * 0.16).toFixed(2)}deg`);
      }
      frame = window.requestAnimationFrame(animate);
    }
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let blink: number | undefined;
    let openEyes: number | undefined;
    function scheduleBlink() {
      blink = window.setTimeout(() => {
        setIsBlinking(true);
        openEyes = window.setTimeout(() => {
          setIsBlinking(false);
          scheduleBlink();
        }, 145);
      }, 1800 + Math.random() * 3200);
    }
    scheduleBlink();
    return () => {
      if (blink) window.clearTimeout(blink);
      if (openEyes) window.clearTimeout(openEyes);
    };
  }, []);

  return (
    <div
      ref={root}
      className={`rig-root growth-stage-${growthStage} care-style-${careStyle} behavior-${behavior} ${isPressed ? "is-pressed" : ""} ${isBlinking ? "is-blinking" : ""}`}
      data-behavior={behavior}
    >
      <button className="rig-leaf" type="button" aria-label="Touch Niumpi's leaf" onClick={onLeafTouch} />
      <span className="rig-leaf-extra rig-leaf-two" aria-hidden="true" />
      <span className="rig-leaf-extra rig-leaf-three" aria-hidden="true" />
      <span className="rig-leaf-extra rig-leaf-four" aria-hidden="true" />
      <span className="rig-leaf-extra rig-leaf-five" aria-hidden="true" />
      <span className="soul-spark soul-spark-one" aria-hidden="true" />
      <span className="soul-spark soul-spark-two" aria-hidden="true" />
      <span className="sleep-wisp sleep-wisp-one" aria-hidden="true">z</span>
      <span className="sleep-wisp sleep-wisp-two" aria-hidden="true">z</span>

      <button
        className="rig-hitbox"
        type="button"
        aria-label="Pet Niumpi"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(event) => event.preventDefault()}
      >
        <span className="rig-foot rig-foot-left" aria-hidden="true" />
        <span className="rig-foot rig-foot-right" aria-hidden="true" />
        <span className="rig-arm rig-arm-left" aria-hidden="true" />
        <span className="rig-arm rig-arm-right" aria-hidden="true" />
        <span className="rig-visual" aria-hidden="true">
          <Image
            className="rig-body"
            src="/niumpi-rig-body.png"
            alt=""
            width={1254}
            height={1254}
            priority
            draggable={false}
          />
          <span className="rig-face">
            <span className="rig-eye rig-eye-left">
              <span className="rig-pupil" />
              <span className="rig-eyelid" />
            </span>
            <span className="rig-eye rig-eye-right">
              <span className="rig-pupil" />
              <span className="rig-eyelid" />
            </span>
            <span className="rig-cheek rig-cheek-left" />
            <span className="rig-cheek rig-cheek-right" />
            <span className="rig-mouth"><span className="rig-tongue" /></span>
          </span>
        </span>
      </button>
    </div>
  );
}
