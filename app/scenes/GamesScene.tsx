"use client";

import { useState } from "react";
import { Art } from "../ui/Art";
import { Panel } from "../ui/parts";
import { useGame } from "../ui/GameProvider";
import { minigames } from "../game/config/minigames";
import { DewdropDash } from "../minigames/DewdropDash";
import { MoonberryMix } from "../minigames/MoonberryMix";
import { CloudStack } from "../minigames/CloudStack";
import { Leafbeat } from "../minigames/Leafbeat";
import { HideAndSqueak } from "../minigames/HideAndSqueak";
import { DreamPath } from "../minigames/DreamPath";
import { copy } from "../game/config/copy";
import type { MinigameId } from "../game/types";

const registry: Record<MinigameId, (props: { onExit: () => void }) => React.ReactElement> = {
  "dewdrop-dash": DewdropDash,
  "moonberry-mix": MoonberryMix,
  "cloud-stack": CloudStack,
  leafbeat: Leafbeat,
  "hide-squeak": HideAndSqueak,
  "dream-path": DreamPath,
};

export function GamesScene() {
  const { state } = useGame();
  const [open, setOpen] = useState<MinigameId | null>(null);

  if (open) {
    const Game = registry[open];
    return <div className="scene scene-games is-playing"><Game onExit={() => setOpen(null)} /></div>;
  }

  const talents = Object.entries(state.personality.talents).filter(([, level]) => level > 0);

  return (
    <div className="scene scene-games">
      <header className="scene-head">
        <div className="scene-title-block">
          <h1>{copy.home.miniGames}</h1>
          <p>Short rounds, real rewards. Playing is always free — only the payout tapers.</p>
        </div>
      </header>

      <ul className="game-grid">
        {minigames.map((game) => {
          const record = state.minigames[game.id];
          return (
            <li key={game.id}>
              <button className={`game-tile tile-${game.id}`} type="button" onClick={() => setOpen(game.id)}>
                <span className="game-art"><Art name={game.art} size={38} /></span>
                <strong>{game.name}</strong>
                <small>{game.note}</small>
                <span className="game-meta">
                  {record ? `best ${record.best} · ${record.plays} plays` : "not played yet"}
                </span>
                <span className="game-talent">Trains {game.talent}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <Panel title="Talents" art="star" note="Games and activities build these over time">
        {talents.length === 0 ? (
          <p className="soft-note">Play a round to start a talent.</p>
        ) : (
          <ul className="talent-list">
            {talents.map(([id, level]) => (
              <li key={id}>
                <span className="talent-name">{id}</span>
                <span className="talent-pips" aria-label={`level ${Math.min(5, Math.ceil(level / 2))} of 5`}>
                  {Array.from({ length: 5 }, (_, index) => (
                    <i key={index} className={index < Math.ceil(level / 2) ? "is-on" : ""} />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
