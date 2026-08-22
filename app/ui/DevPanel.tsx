"use client";

import { useState } from "react";
import { useGame } from "./GameProvider";
import { getTimeMultiplier, setTimeMultiplier } from "../game/time";
import { applyElapsed } from "../game/stats";
import { settleUnlocks } from "../game/unlocks";
import { lockRoute, phenotypeFor } from "../game/evolution";
import { routes } from "../game/config/routes";
import { weathers } from "../game/config/weather";
import { traits } from "../game/config/traits";
import { ingredients } from "../game/config/foods";
import { DAY_MS } from "../game/config/stages";
import { vectorIds } from "../game/state";
import type { StageId } from "../game/types";

/**
 * Only ever mounted when NODE_ENV is not production and `?dev=1` is present,
 * so it cannot reach a shipped build.
 */
export function DevPanel() {
  const { state, patch, now } = useGame();
  const [open, setOpen] = useState(false);

  if (process.env.NODE_ENV === "production") return null;

  /**
   * Rewinds every origin timestamp so the whole age-gated system — unlocks,
   * stage timing, plant growth — behaves as if the days really passed.
   */
  function simulateDays(days: number) {
    const shift = days * DAY_MS;
    patch((current) => {
      const aged = {
        ...current,
        profile: { ...current.profile, createdAt: current.profile.createdAt - shift, lastSeenAt: current.profile.lastSeenAt - shift },
        niumpi: {
          ...current.niumpi,
          createdAt: current.niumpi.createdAt - shift,
          stageStartedAt: current.niumpi.stageStartedAt - shift,
          hatchedAt: current.niumpi.hatchedAt === null ? null : current.niumpi.hatchedAt - shift,
        },
      };
      return settleUnlocks(applyElapsed(aged, now).state, now);
    });
  }

  return (
    <div className={`dev-panel ${open ? "is-open" : ""}`}>
      <button className="dev-toggle" type="button" onClick={() => setOpen(!open)}>DEV</button>
      {open && (
        <div className="dev-body">
          <p>Care {Math.floor(state.niumpi.careMoments)} · Bond {Math.round(state.niumpi.bond)} · Stage {state.niumpi.stage}</p>

          <label className="dev-row">
            Time ×{getTimeMultiplier()}
            <input type="range" min={1} max={500} defaultValue={getTimeMultiplier()}
              onChange={(event) => setTimeMultiplier(Number(event.target.value))} />
          </label>

          <div className="dev-row">
            <button type="button" onClick={() => simulateDays(1)}>+1 day</button>
            <button type="button" onClick={() => simulateDays(7)}>+7 days</button>
            <button type="button" onClick={() => patch((c) => ({ ...c, niumpi: { ...c.niumpi, careMoments: c.niumpi.careMoments + 50 } }))}>+50 care</button>
            <button type="button" onClick={() => patch((c) => ({ ...c, niumpi: { ...c.niumpi, bond: Math.min(100, c.niumpi.bond + 20) } }))}>+20 bond</button>
          </div>

          <div className="dev-row">
            {([0, 1, 2, 3, 4, 5] as StageId[]).map((stage) => (
              <button key={stage} type="button"
                onClick={() => patch((c) => ({ ...c, niumpi: { ...c.niumpi, stage, hatchedAt: c.niumpi.hatchedAt ?? now, seedProgress: 1 } }))}>
                S{stage}
              </button>
            ))}
          </div>

          <div className="dev-row">
            {routes.map((route) => (
              <button key={route.id} type="button" onClick={() => patch((c) => {
                const next = { ...c, evolution: { ...c.evolution, lockedRoute: route.id } };
                return { ...next, phenotype: phenotypeFor(next) };
              })}>{route.name}</button>
            ))}
            <button type="button" onClick={() => patch((c) => lockRoute(c, now).state)}>Auto-lock</button>
          </div>

          <div className="dev-row">
            {weathers.map((weather) => (
              <button key={weather.id} type="button"
                onClick={() => patch((c) => ({ ...c, weather: { key: weather.id, since: now } }))}>{weather.name}</button>
            ))}
          </div>

          <div className="dev-row">
            <button type="button" onClick={() => patch((c) => ({
              ...c,
              personality: { ...c.personality, traits: Object.fromEntries(traits.map((t) => [t.id, now])) },
            }))}>All traits</button>
            <button type="button" onClick={() => patch((c) => ({
              ...c,
              inventory: {
                ...c.inventory,
                ingredients: { ...c.inventory.ingredients, ...Object.fromEntries(ingredients.map((item) => [item.id, 30])) },
                currencies: { dewdrops: 2000, starFragments: 100 },
              },
            }))}>Fill pantry</button>
            <button type="button" onClick={() => {
              if (confirm("Delete this save and start over?")) {
                window.localStorage.clear();
                window.location.reload();
              }
            }}>Reset save</button>
          </div>

          <ul className="dev-vectors">
            {vectorIds.map((id) => (
              <li key={id}>{id}: {state.evolution.vectors[id].toFixed(1)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
