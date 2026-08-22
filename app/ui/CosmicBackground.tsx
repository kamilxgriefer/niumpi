"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";
import { useGame } from "./GameProvider";

/**
 * The outer, cosmic layer. Stars are laid out once from a fixed pattern, so
 * they never re-shuffle between renders, and the whole layer collapses to a
 * flat gradient under reduced motion or low-power mode.
 */
const STAR_COUNT = 46;

export function CosmicBackground() {
  const { state } = useGame();
  const lowPower = state.profile.settings.lowPower;

  const stars = useMemo(
    () => Array.from({ length: STAR_COUNT }, (_, index) => {
      const golden = (index * 137.508) % 360;
      return {
        id: index,
        left: (golden / 360) * 100,
        top: ((index * 61.8) % 100),
        size: 1 + (index % 3) * 0.7,
        delay: (index % 11) * 0.9,
        depth: index % 3,
      };
    }),
    [],
  );

  return (
    <div className={`cosmic ${lowPower ? "is-flat" : ""}`} aria-hidden="true">
      <span className="cosmic-base" />
      <span className="cosmic-glow cosmic-glow-a" />
      <span className="cosmic-glow cosmic-glow-b" />
      <span className="cosmic-glow cosmic-glow-c" />
      {!lowPower && (
        <span className="cosmic-stars">
          {stars.map((star) => (
            <i
              key={star.id}
              className={`cosmic-star depth-${star.depth}`}
              style={{
                "--x": `${star.left}%`,
                "--y": `${star.top}%`,
                "--s": `${star.size}px`,
                "--d": `${star.delay}s`,
              } as CSSProperties}
            />
          ))}
        </span>
      )}
    </div>
  );
}
