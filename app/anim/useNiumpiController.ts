"use client";

import { useEffect, useRef } from "react";
import { NiumpiAnimationController } from "./NiumpiAnimationController.ts";
import type { AnimState } from "./NiumpiAnimationController.ts";

/**
 * Binds one controller to whichever rig element is currently mounted. Scenes
 * come and go; the controller instance and its rAF loop do not.
 */
export function useNiumpiController(controller: NiumpiAnimationController) {
  const rig = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = rig.current;
    if (!node) return;
    controller.attach(node);
    return () => controller.detach();
  }, [controller]);
  return rig;
}

export type { AnimState };
