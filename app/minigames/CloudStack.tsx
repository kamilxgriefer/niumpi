"use client";

import { PhaserHost } from "./PhaserHost";
import { GameFrame } from "./GameFrame";
import type { RoundApi } from "./GameFrame";
import { useGame } from "../ui/GameProvider";
import type { CueName } from "../ui/audio";

const load = () => import("./phaser/CloudStackScene").then((module) => module.makeCloudStackScene);

export function CloudStack({ onExit }: { onExit: () => void }) {
  return (
    <GameFrame id="cloud-stack" onExit={onExit}>
      {(api) => <Round api={api} />}
    </GameFrame>
  );
}

function Round({ api }: { api: RoundApi }) {
  const { cue } = useGame();
  return (
    <PhaserHost
      load={load}
      difficulty={api.difficulty}
      label="Cloud Stack — press space or tap to drop each cloud"
      onScore={api.add}
      onCombo={api.setCombo}
      onEnd={api.end}
      cue={(name) => cue(name as CueName)}
    />
  );
}
