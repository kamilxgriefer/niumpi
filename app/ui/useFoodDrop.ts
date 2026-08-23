"use client";

import { useCallback, useRef, useState } from "react";
import { feed } from "../game/actions.ts";
import type { GameState } from "../game/types.ts";

/**
 * Arming a treat and dropping it on the creature.
 *
 * Home and the Niumpi tab had character-identical copies of this. Two copies
 * of a hit test is two places for the drop zone to drift out of agreement with
 * where the creature actually is.
 */
export function useFoodDrop(
  state: GameState,
  run: (result: ReturnType<typeof feed>) => void,
  clock: () => number,
) {
  const [armed, setArmed] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  /** The drop zone is the creature itself, not the whole panel around it. */
  const hitTest = useCallback((x: number, y: number) => {
    const box = stageRef.current?.querySelector(".rig-root")?.getBoundingClientRect();
    return Boolean(box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom);
  }, []);

  const dropFood = useCallback((x: number, y: number) => {
    if (!armed || !hitTest(x, y)) return false;
    run(feed(state, armed, clock()));
    setArmed(null);
    return true;
  }, [armed, clock, hitTest, run, state]);

  return { armed, setArmed, stageRef, hitTest, dropFood };
}
