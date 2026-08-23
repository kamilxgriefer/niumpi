"use client";

import type { CSSProperties, MouseEvent, PointerEvent, RefObject } from "react";
import type { Phenotype, StageId } from "../game/types";
import { profileFor } from "../game/config/growth.ts";
import { NiumpiBody } from "./niumpi/NiumpiBody.tsx";

/**
 * Pure structure. The body itself is generated from the stage profile by
 * NiumpiBody; this component owns only the interaction surfaces and the effect
 * layers around it. It holds no animation state and never re-renders on a
 * frame — NiumpiAnimationController drives the root's classes and variables.
 */

export type BodyPart = "head" | "belly" | "side" | "feet" | "leaf";

type Props = {
  /** The controller attaches to this node and owns its classes and variables. */
  rigRef: RefObject<HTMLDivElement | null>;
  phenotype: Phenotype;
  stage: StageId;
  moodColour: string;
  petName: string;
  onPartActivate?: (part: BodyPart) => void;
  onLeafTouch: () => void;
  onActivate: (event: MouseEvent<HTMLButtonElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: () => void;
};

export function NiumpiRenderer({
  rigRef, phenotype, stage, moodColour, petName,
  onPartActivate, onLeafTouch, onActivate, onPointerDown, onPointerMove, onPointerUp,
}: Props) {
  const profile = profileFor(stage);

  const style = {
    "--mood-colour": `var(--mood-${moodColour})`,
    // Growth is felt through the box the creature occupies, so a hatchling
    // genuinely takes up less of the scene than a grown Niumpi.
    "--stage-scale": profile.scale,
    // Places the leaf touch target over wherever the leaves ended up.
    "--tip-top": `${(profile.body.tipY / 200) * 100}%`,
  } as CSSProperties;

  return (
    <div
      ref={rigRef}
      className={[
        "rig-root",
        `growth-stage-${profile.id}`,
        `arms-${profile.arms}`,
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
        <NiumpiBody profile={profile} />
      </button>

      {profile.leaves > 0 && (
        <button
          className="rig-leaf-touch"
          type="button"
          aria-label={`Touch ${petName}'s mood leaf`}
          onClick={onLeafTouch}
        />
      )}

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

/**
 * Growth stages and visual stages are the same thing now. Care moments are a
 * fallback for saves whose stage never settled.
 */
export function visualStageFor(careMoments: number, stage: number): StageId {
  if (stage >= 5 || careMoments >= 520) return 5;
  if (stage >= 4 || careMoments >= 300) return 4;
  if (stage >= 3 || careMoments >= 150) return 3;
  if (stage >= 2 || careMoments >= 62) return 2;
  return 1;
}
