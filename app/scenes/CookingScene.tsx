"use client";

import { useState } from "react";
import { Art } from "../ui/Art";
import { Panel } from "../ui/parts";
import { NiumpiBody } from "../ui/niumpi/NiumpiBody";
import { profileFor, visualStageFor } from "../game/config/growth";
import { useGame } from "../ui/GameProvider";
import { ingredients, ingredientMap } from "../game/config/foods";
import { matchRecipe, recipes } from "../game/config/recipes";
import { cook } from "../game/actions";
import { copy } from "../game/config/copy";
import { resolveRigAppearance } from "../rig/appearance";
import type { Phenotype } from "../game/types";

const MAX_SLOTS = 3;

export function CookingScene() {
  const { state, run, toast, clock} = useGame();
  const [slots, setSlots] = useState<string[]>([]);
  const [result, setResult] = useState<{ name: string; note: string; art: string } | null>(null);

  const preview = slots.length >= 2 ? matchRecipe(slots) : null;
  const owned = ingredients.filter((item) => (state.inventory.ingredients[item.id] ?? 0) > 0);
  const chefStage = visualStageFor(state.niumpi.careMoments, state.niumpi.stage);
  const chefAppearance = resolveRigAppearance({
    ...state,
    niumpi: { ...state.niumpi, stage: chefStage },
  });
  const chefMorphology: Phenotype["morphology"] = chefAppearance.form === "neutral" ? "seedling" : chefAppearance.form;
  const chefPhenotype: Phenotype = {
    ...state.phenotype,
    morphology: chefMorphology,
    markings: [...chefAppearance.markings],
  };

  function add(id: string) {
    if (slots.length >= MAX_SLOTS) { toast("The bench is full — tap a slot to take one off", "✕"); return; }
    const used = slots.filter((entry) => entry === id).length;
    if ((state.inventory.ingredients[id] ?? 0) <= used) { toast("You need more of that", "✕"); return; }
    setSlots([...slots, id]);
  }

  function makeIt() {
    if (slots.length < 2) return;
    const outcome = run(cook(state, slots, clock()), "Cooking");
    const recipe = outcome.recipeId ? recipes.find((entry) => entry.id === outcome.recipeId) : null;
    setResult(recipe
      ? { name: recipe.name, note: recipe.bonus ?? recipe.note, art: recipe.art }
      : { name: "Mystery something", note: "Nobody will ever make it again", art: "puff" });
    setSlots([]);
  }

  return (
    <div className="scene scene-cooking">
      <header className="scene-head">
        <div className="scene-title-block">
          <h1>{copy.home.cooking}</h1>
          <p>{copy.home.cookingNote}</p>
        </div>
      </header>

      <div className="kitchen">
        <div className="kitchen-bench">
          <div className="cook-slots">
            {Array.from({ length: MAX_SLOTS }, (_, index) => {
              const id = slots[index];
              return (
                <button
                  key={index}
                  className={`cook-slot ${id ? "is-filled" : ""}`}
                  type="button"
                  aria-label={id ? `Remove ${ingredientMap[id].name}` : `Empty slot ${index + 1}`}
                  onClick={() => id && setSlots(slots.filter((_, position) => position !== index))}
                >
                  {id ? <Art name={ingredientMap[id].art} size={36} /> : <span className="slot-plus">+</span>}
                </button>
              );
            })}
          </div>

          <div className="cook-preview">
            {preview ? (
              <>
                <Art name={preview.art} size={54} />
                <strong>{preview.name}</strong>
                <ul className="cook-effects">
                  {Object.entries(preview.effects).map(([id, amount]) => (
                    <li key={id}>+{amount} {id}</li>
                  ))}
                  {preview.bonus && <li className="is-bonus">{preview.bonus}</li>}
                </ul>
              </>
            ) : (
              <>
                <Art name="cook" size={54} />
                <strong>{slots.length < 2 ? "Pick two or three things" : "An experiment"}</strong>
                <small>{slots.length < 2 ? "Any combination works" : "Unknown combinations still make something"}</small>
              </>
            )}
          </div>

          <div className="cook-pantry">
            <span className="cook-pantry-label">Pantry</span>
            {owned.length === 0 ? (
              <p className="soft-note">Grow or find ingredients first.</p>
            ) : (
              <ul className="cook-rail">
                {owned.map((item) => (
                  <li key={item.id}>
                    <button className="pantry-card" type="button" onClick={() => add(item.id)}>
                      <Art name={item.art} size={28} />
                      <strong>{item.name}</strong>
                      <span>×{state.inventory.ingredients[item.id]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="cook-actions">
            <button className="ghost-button" type="button" disabled={!slots.length} onClick={() => setSlots([])}>Clear</button>
            <button className="primary-button" type="button" disabled={slots.length < 2} onClick={makeIt}>Cook it</button>
          </div>
        </div>

        {/* The player's actual Niumpi, at whatever stage it has reached. This
            was a flat 24px sprite under a white CSS blob, which read as a
            rendering fault rather than a cook — and it contradicted the
            creature standing on every other screen. */}
        <div className="cook-chef" aria-hidden="true">
          <span className="chef-hat" />
          <span className={`cook-chef-body body-${chefAppearance.form === "neutral" ? "cloud" : chefAppearance.form} morph-${chefMorphology}`}>
            <NiumpiBody profile={profileFor(chefStage)} phenotype={chefPhenotype} />
          </span>
        </div>
      </div>

      {result && (
        <div className="cook-result" role="status">
          <Art name={result.art} size={40} />
          <div><strong>{result.name}</strong><small>{result.note}</small></div>
          <button className="icon-button" type="button" aria-label="Dismiss" onClick={() => setResult(null)}>
            <Art name="close" size={16} />
          </button>
        </div>
      )}

      <Panel title="Recipe book" art="book" note={`${state.cooking.known.length} of ${recipes.length} discovered`}>
        <ul className="recipe-grid">
          {recipes.map((recipe) => {
            const known = state.cooking.known.includes(recipe.id);
            return (
              <li key={recipe.id} className={known ? "" : "is-unknown"}>
                <button
                  className="recipe-card"
                  type="button"
                  disabled={!known}
                  onClick={() => setSlots(recipe.parts.slice(0, MAX_SLOTS))}
                >
                  <Art name={known ? recipe.art : "lock"} size={30} />
                  <strong>{known ? recipe.name : "???"}</strong>
                  {known && (
                    <small>{recipe.parts.map((part) => ingredientMap[part].name).join(" + ")}</small>
                  )}
                  {known && state.cooking.cooked[recipe.id] > 0 && (
                    <span className="recipe-count">cooked ×{state.cooking.cooked[recipe.id]}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
