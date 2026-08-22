"use client";

import { lazy, Suspense } from "react";
import { motion } from "motion/react";
import { useGame } from "./GameProvider";
import { HomeScene } from "../scenes/HomeScene";
import { SeedChamberScene } from "../scenes/SeedChamberScene";
import { CompanionScene } from "../scenes/CompanionScene";
import { easeOut, sceneVariants } from "../anim/transitions";
import { LockedState } from "./parts";
import { Brand } from "./Brand";
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
    <motion.main
      key={active}
      className="scene-host"
      variants={sceneVariants}
      initial="enter"
      animate="center"
      transition={easeOut}
    >
      {!ready ? (
        <SceneSkeleton />
      ) : unlock.open ? (
        <Suspense fallback={<SceneFallback />}>
          <Scene />
        </Suspense>
      ) : (
        <div className="scene"><LockedState note={unlock.note} /></div>
      )}
    </motion.main>
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
