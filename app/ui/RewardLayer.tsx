"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { Art } from "./Art";
import { useGame } from "./GameProvider";
import { ingredientMap } from "../game/config/foods";
import { itemMap } from "../game/config/items";
import { recipeMap } from "../game/config/recipes";
import { traitMap } from "../game/config/traits";
import { rarityMap } from "../game/config/rarities";
import { popIn } from "../anim/transitions";
import type { Reward } from "../game/types";

function describe(reward: Reward): { art: string; image?: string; title: string; note: string } {
  switch (reward.kind) {
    case "ingredient":
      return { art: ingredientMap[reward.id]?.art ?? "snack", title: ingredientMap[reward.id]?.name ?? reward.id, note: `×${reward.amount}` };
    case "currency":
      return { art: reward.id === "dewdrops" ? "dewdrop" : "star", title: reward.id === "dewdrops" ? "Dewdrops" : "Star Fragments", note: `+${reward.amount}` };
    case "item": {
      const item = itemMap[reward.id];
      return { art: item?.art ?? "collect", image: item?.image, title: item?.name ?? reward.id, note: item ? `${rarityMap[item.rarity].name} room collectible` : "New item" };
    }
    case "recipe":
      return { art: recipeMap[reward.id]?.art ?? "cook", title: recipeMap[reward.id]?.name ?? reward.id, note: "New recipe" };
    case "memory":
      return { art: "memory", title: reward.title, note: "New memory" };
    case "trait":
      return { art: "trait", title: traitMap[reward.id]?.name ?? reward.name, note: "New trait" };
    case "talent":
      return { art: "star", title: reward.id, note: `Talent level ${reward.level}` };
    case "stage":
      return { art: "evolve", title: reward.name, note: "Grew a stage" };
    case "route":
      return { art: "evolution", title: reward.name, note: "Evolution path" };
    default:
      return { art: "spark", title: "Something", note: "" };
  }
}

/** One card per haul, dismissed by click, Escape or the button. */
export function RewardLayer() {
  const { reward, dismissReward } = useGame();
  const confirm = useRef<HTMLButtonElement>(null);

  // Moving focus is a side effect, so it belongs in an effect, not autoFocus.
  useEffect(() => {
    if (reward) confirm.current?.focus();
  }, [reward]);

  return (
    <AnimatePresence>
      {reward && (
        <motion.div
          className="reward-veil"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismissReward}
        >
          <motion.div
            className="reward-card"
            role="status"
            {...popIn}
            onClick={(event) => event.stopPropagation()}
          >
            <span className="reward-burst" aria-hidden="true"><i /><i /><i /><i /></span>
            <p className="reward-source">{reward.source}</p>
            <h2>{reward.title}</h2>
            <ul className="reward-list">
              {reward.rewards.map((entry, index) => {
                const detail = describe(entry);
                return (
                  <motion.li
                    key={`${entry.kind}-${index}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.06 * index }}
                  >
                    {detail.image ? <Image className="reward-item-image" src={detail.image} alt="" width={108} height={108} unoptimized /> : <Art name={detail.art} size={26} />}
                    <span><strong>{detail.title}</strong><small>{detail.note}</small></span>
                  </motion.li>
                );
              })}
            </ul>
            <button className="primary-button" type="button" onClick={dismissReward} ref={confirm}>
              Lovely
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ToastLayer() {
  const { toasts } = useGame();
  return (
    <div className="toast-stack" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.p
            key={toast.id}
            className="toast"
            initial={{ opacity: 0, y: -12, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
          >
            <span className="toast-icon" aria-hidden="true">{toast.icon}</span>
            {toast.text}
          </motion.p>
        ))}
      </AnimatePresence>
    </div>
  );
}
