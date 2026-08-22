"use client";

import type { DayPeriod } from "./gameConfig";

/** Purely decorative: it mirrors the time of day the room already tracks. */
export function RoomWindow({ dayPeriod }: { dayPeriod: DayPeriod }) {
  return (
    <div className={`room-window window-${dayPeriod}`} aria-hidden="true">
      <span className="window-pane">
        <span className="sky-orb" />
        <span className="room-star star-one" />
        <span className="room-star star-two" />
        <span className="room-star star-three" />
        <span className="window-hill hill-back" />
        <span className="window-hill hill-front" />
      </span>
      <span className="window-plant">
        <span className="plant-leaf plant-leaf-left" />
        <span className="plant-leaf plant-leaf-right" />
        <span className="plant-pot" />
      </span>
    </div>
  );
}
