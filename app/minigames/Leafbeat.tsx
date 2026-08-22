"use client";

import { PhaserHost } from "./PhaserHost";
import { GameFrame } from "./GameFrame";
import type { RoundApi } from "./GameFrame";
import { useGame } from "../ui/GameProvider";
import type { CueName } from "../ui/audio";

const load = () => import("./phaser/LeafbeatScene").then((module) => module.makeLeafbeatScene);

export function Leafbeat({ onExit }: { onExit: () => void }) {
  return (
    <GameFrame id="leafbeat" onExit={onExit}>
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
      label="Leafbeat — press space or tap exactly when a leaf reaches the line"
      onScore={api.add}
      onCombo={api.setCombo}
      onEnd={api.end}
      cue={(name) => cue(name as CueName)}
    />
  );
}
