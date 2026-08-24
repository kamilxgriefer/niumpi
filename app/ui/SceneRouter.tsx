"use client";

import { lazy, Suspense } from "react";
import { useGame } from "./GameProvider";
import { HomeScene } from "../scenes/HomeScene";
import { SeedChamberScene } from "../scenes/SeedChamberScene";
import { CompanionScene } from "../scenes/CompanionScene";
import { LockedState } from "./parts";
import { Brand } from "./Brand";
import { SceneAtmosphere } from "./SceneAtmosphere";
import type { SceneId } from "../game/types";

/**
 * Home, Seed and the companion scene load eagerly — they are the first thing
 * anybody sees. Everything heavier is code-split and fetched on first visit.
 */
const RoomScene = lazy(() => import("../scenes/RoomScene").then((m) => ({ default: m.RoomScene })));
const MemoryScene = lazy(() => import("../scenes/MemoryScene").then((m) => ({ default: m.MemoryScene })));
const GardenScene = lazy(() => import("../scenes/GardenScene").then((m) => ({ default: m.GardenScene })));
const GamesScene = lazy(() => import("../scenes/GamesScene").then((m) => ({ default: m.GamesScene })));
const ShopScene = lazy(() => import("../scenes/ShopScene").then((m) => ({ default: m.ShopScene })));
const JourneyScene = lazy(() => import("../scenes/JourneyScene").then((m) => ({ default: m.JourneyScene })));
const EvolutionScene = lazy(() => import("../scenes/EvolutionScene").then((m) => ({ default: m.EvolutionScene })));
const CookingScene = lazy(() => import("../scenes/CookingScene").then((m) => ({ default: m.CookingScene })));
const DreamDoorsScene = lazy(() => import("../scenes/DreamDoorsScene").then((m) => ({ default: m.DreamDoorsScene })));
const FriendsScene = lazy(() => import("../scenes/FriendsScene").then((m) => ({ default: m.FriendsScene })));
const AboutScene = lazy(() => import("../scenes/AboutScene").then((m) => ({ default: m.AboutScene })));

const registry: Record<SceneId, React.ComponentType> = {
  home: HomeScene,
  seed: SeedChamberScene,
  niumpi: CompanionScene,
  room: RoomScene,
  memory: MemoryScene,
  garden: GardenScene,
  games: GamesScene,
  shop: ShopScene,
  journey: JourneyScene,
  evolution: EvolutionScene,
  cooking: CookingScene,
  dreams: DreamDoorsScene,
  friends: FriendsScene,
  about: AboutScene,
};

export function SceneRouter() {
  const { scene, state, isOpen, ready } = useGame();

  // Before the save is read the scene is unknown; show the frame, not a guess.
  const active: SceneId = !ready ? "home" : state.niumpi.hatchedAt ? scene : "seed";
  const unlock = isOpen(active);
  const Scene = registry[active] ?? HomeScene;

  return (
    /*
     * Deliberately not animated.
     *
     * A 16px slide on this container moved every control in the scene for
     * ~300ms after mount — and the router remounts it when `ready` flips and
     * `active` changes, so the slide replayed just as the first controls became
     * clickable. Measured: 13.7px of travel still in progress at the moment a
     * button first appears. That is a button sliding out from under a finger,
     * which matters more for this audience than the flourish was worth, and it
     * was the cause of clicks landing on a moving target.
    */
    <main key={active} className="scene-host">
      <SceneAtmosphere scene={active} />
      {!ready ? (
        <SceneSkeleton />
      ) : unlock.open ? (
        <Suspense fallback={<SceneFallback />}>
          <Scene />
        </Suspense>
      ) : (
        <div className="scene"><LockedState note={unlock.note} /></div>
      )}
    </main>
  );
}

/** Server-rendered frame: real layout, no invented save data. */
function SceneSkeleton() {
  return (
    <div className="scene scene-skeleton" aria-busy="true">
      <Brand />
      <div className="skeleton-grid">
        <span className="skeleton-block is-tall" />
        <span className="skeleton-block is-hero" />
        <span className="skeleton-block is-tall" />
      </div>
      <p className="skeleton-note" role="status" aria-live="polite">Waking Niumpi…</p>
    </div>
  );
}

function SceneFallback() {
  return (
    <div className="scene scene-loading" role="status" aria-live="polite">
      <span className="boot-orb" aria-hidden="true" />
      <p>Opening…</p>
    </div>
  );
}
