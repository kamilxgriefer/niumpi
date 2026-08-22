"use client";

import { PhaserHost } from "./PhaserHost";
import { GameFrame } from "./GameFrame";
import type { RoundApi } from "./GameFrame";
import { useGame } from "../ui/GameProvider";
import type { CueName } from "../ui/audio";

const load = () => import("./phaser/DewdropDashScene").then((module) => module.makeDewdropDashScene);

export function DewdropDash({ onExit }: { onExit: () => void }) {
  return (
    <GameFrame id="dewdrop-dash" onExit={onExit}>
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
      label="Dewdrop Dash — move left and right to catch the drops"
      onScore={api.add}
      onCombo={api.setCombo}
      onEnd={api.end}
      cue={(name) => cue(name as CueName)}
    />
  );
}
