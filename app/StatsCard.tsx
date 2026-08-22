"use client";

import { useId } from "react";
import { LOW_NEED, needMeta, needOrder } from "./gameConfig";
import type { Need } from "./gameConfig";

export function StatsCard({ needs, petName }: { needs: Record<Need, number>; petName: string }) {
  const base = useId();

  return (
    <section className="stats-card" aria-label={`${petName}'s needs`}>
      {needOrder.map((need: Need) => {
        const value = Math.max(0, Math.min(100, Math.round(needs[need])));
        const isLow = value < LOW_NEED;
        const labelId = `${base}-${need}`;
        return (
          <div className={`stat stat-${need} ${isLow ? "is-low" : ""}`} key={need}>
            <span className="stat-icon" aria-hidden="true">{needMeta[need].icon}</span>
            <span className="stat-name" id={labelId}>{needMeta[need].label}</span>
            <div
              className="stat-track"
              role="progressbar"
              aria-labelledby={labelId}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={value}
              aria-valuetext={isLow ? `${value} percent — ${needMeta[need].lowNote}` : `${value} percent`}
            >
              <span className="stat-fill" style={{ width: `${value}%` }} />
            </div>
            <span className="stat-value">{value}%</span>
            {isLow && <span className="stat-flag">{needMeta[need].lowNote}</span>}
          </div>
        );
      })}
    </section>
  );
}
