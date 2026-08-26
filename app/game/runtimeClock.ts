import type { GameState } from "./types.ts";

/**
 * A deliberately tiny browser-test seam. Production keeps using the wall
 * clock, while E2E can freeze it before boot so heartbeat/catch-up never
 * changes gameplay state underneath an animation assertion.
 */
export type NiumpiRuntimeTestBridge = {
  now: number;
  heartbeat: boolean;
  liveState?: GameState;
};

declare global {
  interface Window {
    __NIUMPI_RUNTIME_TEST__?: NiumpiRuntimeTestBridge;
  }
}

export function runtimeNow(): number {
  if (typeof window !== "undefined") {
    const controlled = window.__NIUMPI_RUNTIME_TEST__?.now;
    if (Number.isFinite(controlled)) return controlled!;
  }
  return Date.now();
}

export function runtimeHeartbeatEnabled(): boolean {
  return typeof window === "undefined" || window.__NIUMPI_RUNTIME_TEST__?.heartbeat !== false;
}

/** Exposed only when the supported test bridge was installed before boot. */
export function publishLiveGameState(state: GameState): void {
  if (typeof window === "undefined" || !window.__NIUMPI_RUNTIME_TEST__) return;
  window.__NIUMPI_RUNTIME_TEST__.liveState = structuredClone(state);
}
