"use client";

import { useState } from "react";
import { Art } from "../ui/Art";
import { EmptyState, Meter, Modal, Panel } from "../ui/parts";
import { useGame } from "../ui/GameProvider";
import { availablePlants, harvest, plantSeed, viewPlot, water } from "../game/garden";
import { buySeeds } from "../game/inventory";
import { plantMap } from "../game/config/plants";
import { countdownLabel, weatherLabel } from "../game/time";
import { recordCare } from "../game/care";
import { progressMissions } from "../game/missions";
import { addSignal } from "../game/care";
import { awardMemory } from "../game/memories";

export function GardenScene() {
  const { state, update, now, showReward, cue, toast, clock} = useGame();
  const [picking, setPicking] = useState<number | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const weather = weatherLabel(state.weather.key);

  function sow(plotId: number, plantId: string) {
    const next = plantSeed(state, plotId, plantId, clock());
    if (!next) { toast("You need a seed for that", "✕"); return; }
    const care = recordCare(next, "plant", clock(), { nature: 2 });
    let settled = addSignal(care.state, "garden");
    settled = progressMissions(settled, "plant", clock());
    settled = awardMemory(settled, "first-plant", clock()).state;
    update(settled);
    cue("blip");
    setPicking(null);
  }

  return (
    <div className="scene scene-garden">
      <header className="scene-head">
        <div className="scene-title-block">
          <h1>Garden</h1>
          <p>Plants keep growing while you are away — nothing wilts if you’re late.</p>
        </div>
        <div className="scene-head-tools">
          <span className="weather-pill"><Art name={weather.art} size={18} /> {weather.name}</span>
          <button className="ghost-button" type="button" onClick={() => setShopOpen(true)}>
            <Art name="shop" size={16} /> Buy seeds
          </button>
        </div>
      </header>

      <div className="garden-bed">
        {state.garden.plots.map((plot) => {
          const view = viewPlot(plot, now);
          return (
            <div key={plot.id} className={`plot ${view.plantId ? "is-planted" : "is-empty"} ${view.ready ? "is-ready" : ""}`}>
              <div className="plot-soil" aria-hidden="true" />
              {view.plantId ? (
                <>
                  <span className={`plot-plant growth-${Math.round(view.growth * 3)}`}>
                    <Art name={view.art ?? "plant"} size={40} />
                  </span>
                  <p className="plot-name">{view.name}{plot.rare && <em> ✦ rare</em>}</p>
                  <Meter label={view.ready ? "Ready" : countdownLabel(plot.harvestReadyAt ?? 0, now)}
                    value={view.growth * 100} max={100} />
                  <div className="plot-tools">
                    {!plot.wateredAt && !view.ready && (
                      <button className="ghost-button" type="button"
                        onClick={() => { const next = water(state, plot.id, clock()); if (next) { update(next); cue("blip"); } }}>
                        Water
                      </button>
                    )}
                    {view.ready && (
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => {
                          const result = harvest(state, plot.id, clock());
                          if (!result) return;
                          const care = recordCare(result.state, "harvest", clock(), { nature: 3 });
                          let settled = addSignal(care.state, "garden");
                          settled = progressMissions(settled, "harvest", clock());
                          settled = awardMemory(settled, "first-harvest", clock()).state;
                          update(settled);
                          cue("reward");
                          showReward(`${view.name} harvested`, result.rewards, "Garden");
                        }}
                      >
                        Harvest
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <button className="plot-plant-button" type="button" onClick={() => setPicking(plot.id)}>
                  <Art name="leaf" size={26} />
                  Plant something
                </button>
              )}
            </div>
          );
        })}
      </div>

      <Panel title="Seed pouch" art="collect" note="Seeds you already own">
        <ul className="seed-pouch">
          {availablePlants(state).map((plant) => {
            const count = state.inventory.ingredients[`seed:${plant.id}`] ?? 0;
            if (!count) return null;
            return (
              <li key={plant.id}>
                <Art name={plant.art} size={22} /> {plant.name} ×{count}
              </li>
            );
          })}
          {availablePlants(state).every((plant) => !(state.inventory.ingredients[`seed:${plant.id}`] ?? 0)) && (
            <li className="soft-note">No seeds yet — buy some above.</li>
          )}
        </ul>
      </Panel>

      {picking !== null && (
        <Modal title="Plant something" onClose={() => setPicking(null)}>
          <ul className="plant-grid">
            {availablePlants(state).map((plant) => {
              const count = state.inventory.ingredients[`seed:${plant.id}`] ?? 0;
              return (
                <li key={plant.id}>
                  <button className="plant-card" type="button" disabled={count < 1} onClick={() => sow(picking, plant.id)}>
                    <Art name={plant.art} size={32} />
                    <strong>{plant.name}</strong>
                    <small>{plant.note}</small>
                    <span className="plant-meta">{plant.hours} h · ×{count} owned</span>
                    {plant.loves.includes(state.weather.key) && <em className="plant-boost">Loves today’s weather</em>}
                  </button>
                </li>
              );
            })}
          </ul>
        </Modal>
      )}

      {shopOpen && (
        <Modal title="Seed shop" note={`You have ${state.inventory.currencies.dewdrops} dewdrops`} onClose={() => setShopOpen(false)}>
          <ul className="plant-grid">
            {availablePlants(state).map((plant) => (
              <li key={plant.id}>
                <button
                  className="plant-card"
                  type="button"
                  disabled={state.inventory.currencies.dewdrops < plant.price}
                  onClick={() => {
                    const result = buySeeds(state, plant.id, plant.price);
                    if (result.ok) { update(result.state); cue("blip"); toast(`${plant.name} seed bought`, "✦"); }
                    else toast(result.reason, "✕");
                  }}
                >
                  <Art name={plant.art} size={32} />
                  <strong>{plant.name}</strong>
                  <small>Yields {plantMap[plant.id].amount} × {plantMap[plant.id].yields}</small>
                  <span className="plant-meta">{plant.price} dewdrops</span>
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {state.garden.plots.every((plot) => !plot.plantId) && (
        <EmptyState art="garden" title="An empty bed" note="Buy a seed, then plant it in any plot." />
      )}
    </div>
  );
}
