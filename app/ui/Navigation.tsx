"use client";

import { useState } from "react";
import { Art } from "./Art";
import { Modal } from "./parts";
import { useGame } from "./GameProvider";
import { copy } from "../game/config/copy";
import type { SceneId } from "../game/types";

export type NavEntry = { id: SceneId; label: string; art: string };

/** Rail order is fixed by the design board and must not be reshuffled. */
export const railTabs: NavEntry[] = [
  { id: "home", label: copy.nav.home, art: "home" },
  { id: "niumpi", label: copy.nav.niumpi, art: "niumpi" },
  { id: "room", label: copy.nav.room, art: "room" },
  { id: "memory", label: copy.nav.memory, art: "memory" },
  { id: "garden", label: copy.nav.garden, art: "garden" },
  { id: "games", label: copy.nav.games, art: "game" },
  { id: "shop", label: copy.nav.shop, art: "shop" },
];

export const moreTabs: NavEntry[] = [
  { id: "memory", label: copy.nav.memory, art: "memory" },
  { id: "garden", label: copy.nav.garden, art: "garden" },
  { id: "shop", label: copy.nav.shop, art: "shop" },
  { id: "friends", label: copy.nav.friends, art: "friends" },
  { id: "evolution", label: copy.nav.evolution, art: "evolution" },
  { id: "cooking", label: copy.nav.cooking, art: "cook" },
  { id: "dreams", label: copy.nav.dreams, art: "dream" },
  { id: "about", label: copy.nav.about, art: "spark" },
];

const bottomTabs: NavEntry[] = [
  { id: "home", label: copy.nav.home, art: "home" },
  { id: "niumpi", label: copy.nav.niumpi, art: "niumpi" },
  { id: "room", label: copy.nav.room, art: "room" },
  { id: "games", label: copy.nav.games, art: "game" },
];

function useBadge() {
  const { state, now } = useGame();
  return (id: SceneId) => {
    if (id === "memory") {
      const answered = Object.keys(state.seedAnswers).length;
      return answered < 2;
    }
    if (id === "garden") return state.garden.plots.some((plot) => plot.harvestReadyAt && now >= plot.harvestReadyAt);
    if (id === "dreams") return Boolean(state.dream && now >= state.dream.completesAt);
    return false;
  };
}

export function DesktopSidebar() {
  const { scene, goTo, isOpen, cue } = useGame();
  const badge = useBadge();
  return (
    <nav className="rail" aria-label="Main">
      <ul className="rail-list">
        {railTabs.map((tab) => {
          const unlock = isOpen(tab.id);
          const active = scene === tab.id;
          return (
            <li key={tab.id}>
              <button
                className={`rail-tab ${active ? "is-active" : ""} ${unlock.open ? "" : "is-locked"}`}
                type="button"
                aria-current={active ? "page" : undefined}
                aria-disabled={!unlock.open}
                title={unlock.open ? tab.label : `${tab.label} — ${unlock.note}`}
                onClick={() => { if (unlock.open) { cue("blip"); goTo(tab.id); } }}
              >
                <span className="rail-icon">
                  <Art name={unlock.open ? tab.art : "lock"} size={22} />
                  {unlock.open && badge(tab.id) && <span className="rail-dot" aria-hidden="true" />}
                </span>
                <span className="rail-label">{tab.label}</span>
                {!unlock.open && <span className="sr-only">{unlock.note}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function MobileNav() {
  const { scene, goTo, isOpen, cue } = useGame();
  const [showMore, setShowMore] = useState(false);
  const badge = useBadge();
  const inMore = moreTabs.some((tab) => tab.id === scene);

  return (
    <>
      <nav className="bottom-nav" aria-label="Main">
        {bottomTabs.map((tab) => {
          const unlock = isOpen(tab.id);
          const active = scene === tab.id;
          return (
            <button
              key={tab.id}
              className={`bottom-tab ${active ? "is-active" : ""} ${unlock.open ? "" : "is-locked"}`}
              type="button"
              aria-current={active ? "page" : undefined}
              aria-disabled={!unlock.open}
              onClick={() => { if (unlock.open) { cue("blip"); goTo(tab.id); } }}
            >
              <span className="bottom-icon">
                <Art name={unlock.open ? tab.art : "lock"} size={21} />
                {unlock.open && badge(tab.id) && <span className="rail-dot" aria-hidden="true" />}
              </span>
              <span className="bottom-label">{tab.label}</span>
            </button>
          );
        })}
        <button
          className={`bottom-tab ${inMore ? "is-active" : ""}`}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={showMore}
          onClick={() => { cue("blip"); setShowMore(true); }}
        >
          <span className="bottom-icon"><Art name="more" size={21} /></span>
          <span className="bottom-label">{copy.nav.more}</span>
        </button>
      </nav>

      {showMore && (
        <Modal title={copy.nav.more} onClose={() => setShowMore(false)}>
          <ul className="more-grid">
            {moreTabs.map((tab) => {
              const unlock = isOpen(tab.id);
              return (
                <li key={tab.id}>
                  <button
                    className={`more-tile ${unlock.open ? "" : "is-locked"}`}
                    type="button"
                    aria-disabled={!unlock.open}
                    onClick={() => { if (unlock.open) { goTo(tab.id); setShowMore(false); } }}
                  >
                    <Art name={unlock.open ? tab.art : "lock"} size={26} />
                    <span>{tab.label}</span>
                    {!unlock.open && <small>{unlock.note}</small>}
                  </button>
                </li>
              );
            })}
          </ul>
        </Modal>
      )}
    </>
  );
}
