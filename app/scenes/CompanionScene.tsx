"use client";

import { useState } from "react";
import { CompanionStage } from "../ui/CompanionStage";
import { useFoodDrop } from "../ui/useFoodDrop";
import { SnackBar } from "../ui/SnackBar";
import { Art } from "../ui/Art";
import { Modal, StatRow } from "../ui/parts";
import { useGame } from "../ui/GameProvider";
import { gesture, sleep, playWithItem, wake } from "../game/actions";
import { copy } from "../game/config/copy";
import { itemMap, toys } from "../game/config/items";
import { chooseLine, rememberLine } from "../game/reactions";
import type { CareActionId } from "../game/types";

/** The full-screen care scene: fewer panels, more room to touch. */
export function CompanionScene() {
  const { state, run, update, goTo, say, cue, clock} = useGame();
  const { armed, setArmed, stageRef, hitTest, dropFood } = useFoodDrop(state, run, clock);
  const [panel, setPanel] = useState<"none" | "feed" | "toy">("none");



  const act = (action: CareActionId) => run(gesture(state, action, clock()));

  const dock: Array<{ id: string; label: string; art: string; onClick: () => void }> = [
    { id: "pet", label: copy.actions.pet, art: "heart", onClick: () => act("pet") },
    { id: "hug", label: copy.actions.hug, art: "bond", onClick: () => act("hug") },
    { id: "tickle", label: copy.actions.tickle, art: "playful", onClick: () => act("tickle") },
    { id: "brush", label: copy.actions.brush, art: "leaf", onClick: () => act("brush") },
    { id: "dance", label: copy.actions.dance, art: "note", onClick: () => act("dance") },
    { id: "sing", label: copy.actions.sing, art: "note", onClick: () => act("sing") },
    { id: "comfort", label: copy.actions.comfort, art: "hush", onClick: () => act("comfort") },
    { id: "feed", label: copy.actions.feed, art: "snack", onClick: () => setPanel("feed") },
    { id: "toy", label: copy.actions.toy, art: "yarn", onClick: () => setPanel("toy") },
    {
      id: "talk", label: copy.actions.talk, art: "spark",
      onClick: () => {
        const line = chooseLine(state, clock());
        update(rememberLine(state, line.id));
        say(line.text);
        cue("blip");
      },
    },
    { id: "play", label: copy.actions.play, art: "game", onClick: () => goTo("games") },
    {
      id: "sleep",
      label: state.niumpi.sleeping ? copy.actions.wake : copy.home.tuckIn,
      art: state.niumpi.sleeping ? "sun" : "moon",
      onClick: () => run(state.niumpi.sleeping ? wake(state, clock()) : sleep(state, clock())),
    },
  ];

  return (
    <div className="scene scene-companion">
      <div className="companion-hero" ref={stageRef}>
        <CompanionStage targeting={Boolean(armed)} onDropFood={dropFood} />
        <aside className="companion-stats">
          {(["fullness", "energy", "joy"] as const).map((id) => (
            <StatRow key={id} id={id} value={state.stats[id]} />
          ))}
        </aside>
      </div>

      <nav className="action-dock" aria-label="Care actions">
        {dock.map((entry) => (
          <button key={entry.id} className={`dock-button dock-${entry.id}`} type="button" onClick={entry.onClick}>
            <Art name={entry.art} size={22} />
            <span>{entry.label}</span>
          </button>
        ))}
      </nav>

      {panel === "feed" && (
        <Modal title={copy.home.snackBar} onClose={() => setPanel("none")}>
          <SnackBar armed={armed} onArm={setArmed} hitTest={hitTest} />
          <p className="soft-note">Pick a treat, then close this and tap Niumpi — or drag it straight over.</p>
        </Modal>
      )}

      {panel === "toy" && (
        <Modal title="Toys" onClose={() => setPanel("none")}>
          <ul className="toy-grid">
            {toys.map((toy) => {
              const owned = state.inventory.items.includes(toy.id);
              return (
                <li key={toy.id}>
                  <button
                    className={`toy-tile ${owned ? "" : "is-locked"}`}
                    type="button"
                    disabled={!owned}
                    onClick={() => { run(playWithItem(state, toy.id, clock())); setPanel("none"); }}
                  >
                    <Art name={itemMap[toy.id]?.art ?? "yarn"} size={32} />
                    <span>{itemMap[toy.id]?.name ?? toy.label}</span>
                    {!owned && <small>Buy it in the Shop</small>}
                  </button>
                </li>
              );
            })}
          </ul>
        </Modal>
      )}
    </div>
  );
}
