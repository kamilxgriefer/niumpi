"use client";

import { motion } from "motion/react";
import type { PanInfo } from "motion/react";
import { Art } from "./Art";
import { useGame } from "./GameProvider";
import { feed } from "../game/actions";
import { ingredientMap, snackBarOrder } from "../game/config/foods";
import { copy } from "../game/config/copy";
import { spring } from "../anim/transitions";

type Props = {
  /** Arms a treat so it can also be given by tapping the creature. */
  onArm: (foodId: string | null) => void;
  armed: string | null;
  onCook?: () => void;
  /** True when a screen position is over the creature. */
  hitTest: (x: number, y: number) => boolean;
};

/**
 * Three ways to feed, all equal: drag the treat onto Niumpi, tap to arm it and
 * then tap Niumpi, or press the Feed button with the keyboard. Framer Motion
 * owns the drag so a miss springs the treat home instead of vanishing.
 */
export function SnackBar({ onArm, armed, onCook, hitTest }: Props) {
  const { state, run, say, cue, controller, clock} = useGame();
  const asleep = state.niumpi.sleeping;

  function give(foodId: string) {
    const result = run(feed(state, foodId, clock()));
    if (!result.refused) onArm(null);
  }

  function dragEnd(foodId: string, event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    controller.setTargeted(false);
    const point = "clientX" in event
      ? { x: event.clientX, y: event.clientY }
      : { x: info.point.x, y: info.point.y };
    if (hitTest(point.x, point.y)) {
      // The treat only leaves the inventory once the drop actually lands.
      give(foodId);
      return;
    }
    say("Almost! Bring it closer to me.");
  }

  function select(foodId: string) {
    if (asleep) return;
    if ((state.inventory.ingredients[foodId] ?? 0) < 1) { say("There are none left."); return; }
    const next = armed === foodId ? null : foodId;
    onArm(next);
    cue("blip");
    say(next
      ? `Tap me to share the ${ingredientMap[next]?.name.toLowerCase()}!`
      : "Nium? Changed your mind?");
  }

  const lead = asleep
    ? `${state.niumpi.name || "Niumpi"} is asleep`
    : armed
      ? `Tap ${state.niumpi.name || "Niumpi"} to share the ${ingredientMap[armed]?.name.toLowerCase()}`
      : copy.home.snackHint;

  return (
    <section className="snack-bar" aria-label={copy.home.snackBar}>
      <header className="snack-head">
        <div>
          <h2 className="snack-title">
            <Art name="snack" size={18} /> {copy.home.snackBar}
          </h2>
          <p className="snack-lead">{lead}</p>
        </div>
        {onCook && (
          <button className="snack-cook" type="button" onClick={onCook}>
            <Art name="cook" size={16} /> {copy.home.cook}
          </button>
        )}
      </header>

      <ul className="snack-list">
        {snackBarOrder.map((foodId) => {
          const food = ingredientMap[foodId];
          const count = state.inventory.ingredients[foodId] ?? 0;
          const selected = armed === foodId;
          const favorite = state.personality.favoriteFoods.includes(foodId);
          const disliked = state.personality.dislikedFoods.includes(foodId);
          const usable = !asleep && count > 0;
          return (
            <li className="snack-slot" key={foodId}>
              <motion.button
                className={[
                  "snack-card",
                  selected ? "is-selected" : "",
                  count < 1 ? "is-empty" : "",
                ].filter(Boolean).join(" ")}
                type="button"
                disabled={!usable}
                aria-pressed={selected}
                aria-label={`${food.name}, ${count} left${favorite ? ", favourite" : ""}${disliked ? ", disliked" : ""}`}
                drag={usable}
                dragSnapToOrigin
                dragElastic={0.9}
                dragMomentum={false}
                dragTransition={{ bounceStiffness: 420, bounceDamping: 34 }}
                whileHover={usable ? { y: -3 } : undefined}
                whileTap={usable ? { scale: 0.97 } : undefined}
                whileDrag={{ scale: 1.14, zIndex: 60 }}
                transition={spring}
                onDragStart={() => {
                  controller.setTargeted(true);
                  say(`Is that a ${food.name.toLowerCase()}?`);
                }}
                onDragEnd={(event, info) => dragEnd(foodId, event, info)}
                onClick={() => select(foodId)}
              >
                <span className={`snack-icon food-${foodId}`}>
                  <Art name={food.art} size={30} />
                </span>
                <span className="snack-name">{food.name}</span>
                <span className="snack-count">×{count}</span>
                {favorite && <span className="snack-flag is-favorite" title="Favourite">♥</span>}
                {disliked && <span className="snack-flag is-disliked" title="Not a favourite">✕</span>}
              </motion.button>
              {selected && (
                <button className="snack-feed" type="button" onClick={() => give(foodId)}>
                  Feed
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
