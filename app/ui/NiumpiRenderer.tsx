"use client";

import Image from "next/image";
import type { CSSProperties, MouseEvent, PointerEvent, RefObject } from "react";
import type { Phenotype } from "../game/types";

/**
 * Pure structure. Every layer is a composable element whose look comes from
 * CSS and whose motion comes from NiumpiAnimationController — this component
 * holds no animation state and never re-renders on a frame.
 */

export type BodyPart = "head" | "belly" | "side" | "feet" | "leaf";

type Props = {
  /** The controller attaches to this node and owns its classes and variables. */
  rigRef: RefObject<HTMLDivElement | null>;
  phenotype: Phenotype;
  /** 1–4: how many leaves and how developed the arms are. */
  visualStage: 1 | 2 | 3 | 4;
  moodColour: string;
  petName: string;
  onPartActivate?: (part: BodyPart) => void;
  onLeafTouch: () => void;
  onActivate: (event: MouseEvent<HTMLButtonElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: () => void;
};

/** Marking overlays are masked to the body silhouette, so nothing spills out. */
const BODY_MASK = "url(/niumpi-rig-body.png)";

export function NiumpiRenderer({
  rigRef, phenotype, visualStage, moodColour, petName,
  onPartActivate, onLeafTouch, onActivate, onPointerDown, onPointerMove, onPointerUp,
}: Props) {
  const style = {
    "--mood-colour": `var(--mood-${moodColour})`,
    "--body-mask": BODY_MASK,
  } as CSSProperties;

  return (
    <div
      ref={rigRef}
      className={[
        "rig-root",
        `growth-stage-${visualStage}`,
        `body-${phenotype.bodyPalette}`,
        `leaf-${phenotype.leafType}`,
        `eyes-${phenotype.eyeType}`,
        phenotype.aura ? `aura-on aura-${phenotype.aura}` : "",
        phenotype.particles ? `particles-${phenotype.particles}` : "",
        "behavior-idle",
      ].filter(Boolean).join(" ")}
      style={style}
    >
      <span className="layer-aura" aria-hidden="true" />

      <button
        className="rig-leaf"
        type="button"
        aria-label={`Touch ${petName}'s mood leaf`}
        onClick={onLeafTouch}
      />
      {[2, 3, 4, 5].map((index) => (
        <span key={index} className={`rig-leaf-extra rig-leaf-${index}`} aria-hidden="true" />
      ))}

      <span className="layer-particles" aria-hidden="true"><i /><i /><i /></span>
      <span className="sleep-wisp sleep-wisp-one" aria-hidden="true">z</span>
      <span className="sleep-wisp sleep-wisp-two" aria-hidden="true">z</span>

      <button
        className="rig-hitbox"
        type="button"
        aria-label={`Pet ${petName}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onActivate}
        onContextMenu={(event) => event.preventDefault()}
      >
        <span className="rig-foot rig-foot-left" aria-hidden="true" />
        <span className="rig-foot rig-foot-right" aria-hidden="true" />
        <span className="rig-ear rig-ear-left" aria-hidden="true" />
        <span className="rig-ear rig-ear-right" aria-hidden="true" />
        <span className="rig-arm rig-arm-left" aria-hidden="true" />
        <span className="rig-arm rig-arm-right" aria-hidden="true" />

        <span className="rig-visual" aria-hidden="true">
          <Image
            className="layer-body"
            src="/niumpi-rig-body.png"
            alt=""
            width={1254}
            height={1254}
            priority
            draggable={false}
          />
          <span className="layer-tint" />
          <span className="layer-belly" />
          {phenotype.markings.map((marking) => (
            <span key={marking} className={`layer-marking marking-${marking}`} />
          ))}

          <span className="rig-face">
            <span className="rig-eye rig-eye-left">
              <span className="rig-pupil" /><span className="rig-eyelid" />
            </span>
            <span className="rig-eye rig-eye-right">
              <span className="rig-pupil" /><span className="rig-eyelid" />
            </span>
            <span className="rig-cheek rig-cheek-left" />
            <span className="rig-cheek rig-cheek-right" />
            <span className="rig-mouth"><span className="rig-tongue" /></span>
          </span>
          {phenotype.accessory && <span className={`layer-accessory accessory-${phenotype.accessory}`} />}
        </span>
      </button>

      {/* Keyboard-reachable body zones — the pointer path is not the only way in. */}
      {onPartActivate && (
        <span className="rig-zones">
          {(["head", "belly", "side", "feet"] as BodyPart[]).map((part) => (
            <button
              key={part}
              className={`rig-zone rig-zone-${part}`}
              type="button"
              aria-label={`Touch ${petName}'s ${part}`}
              onClick={() => onPartActivate(part)}
            />
          ))}
        </span>
      )}

      <span className="layer-reaction" aria-hidden="true" />
    </div>
  );
}

/** Leaves and arms track overall maturity, not the evolution route. */
export function visualStageFor(careMoments: number, stage: number): 1 | 2 | 3 | 4 {
  if (stage >= 4 || careMoments >= 260) return 4;
  if (stage >= 3 || careMoments >= 120) return 3;
  if (stage >= 2 || careMoments >= 40) return 2;
  return 1;
}
