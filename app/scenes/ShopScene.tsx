"use client";

import { useState } from "react";
import { Art } from "../ui/Art";
import { CurrencyPill, Modal, TabBar } from "../ui/parts";
import { useGame } from "../ui/GameProvider";
import { shopCategories, shopItems, itemMap } from "../game/config/items";
import { buyItem } from "../game/inventory";
import { copy } from "../game/config/copy";

export function ShopScene() {
  const { state, update, cue, toast } = useGame();
  const [category, setCategory] = useState("all");
  const [preview, setPreview] = useState<string | null>(null);

  const visible = shopItems.filter((item) => category === "all" || item.category === category);

  function buy(id: string) {
    const result = buyItem(state, id);
    if (!result.ok) { toast(result.reason, "✕"); cue("fail"); return; }
    update(result.state);
    cue("reward");
    toast(`${itemMap[id].name} is yours`, "✦");
    setPreview(null);
  }

  return (
    <div className="scene scene-shop">
      <header className="scene-head">
        <div>
          <h1>{copy.nav.shop}</h1>
          <p>Every price is shown up front. No surprise boxes, no random chances.</p>
        </div>
        <div className="wallet">
          <CurrencyPill id="dewdrops" amount={state.inventory.currencies.dewdrops} />
          <CurrencyPill id="starFragments" amount={state.inventory.currencies.starFragments} />
        </div>
      </header>

      <TabBar label="Shop categories" active={category} onSelect={setCategory} tabs={shopCategories} />

      <ul className="shop-grid">
        {visible.map((item) => {
          const owned = state.inventory.items.includes(item.id);
          const affordable = state.inventory.currencies[item.currency] >= item.price;
          return (
            <li key={item.id}>
              <div className={`shop-card ${owned ? "is-owned" : ""}`}>
                <button className="shop-art" type="button" onClick={() => setPreview(item.id)}
                  aria-label={`Preview ${item.name}`}>
                  <Art name={item.art} size={44} />
                </button>
                <strong>{item.name}</strong>
                <small>{item.note}</small>
                {item.reaction && <em className="shop-reaction">{item.reaction}</em>}
                {owned ? (
                  <span className="shop-owned"><Art name="check" size={14} /> {copy.states.owned}</span>
                ) : (
                  <button className="shop-buy" type="button" disabled={!affordable} onClick={() => buy(item.id)}>
                    <Art name={item.currency === "dewdrops" ? "dewdrop" : "star"} size={14} />
                    {item.price}
                    {!affordable && <span className="sr-only"> — {copy.states.noInventory}</span>}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {preview && (
        <Modal title={itemMap[preview].name} note={itemMap[preview].note} onClose={() => setPreview(null)}>
          <div className="shop-preview">
            <div className="preview-room">
              <span className="preview-window" />
              <span className="preview-floor" />
              <span className="preview-piece"><Art name={itemMap[preview].art} size={70} /></span>
              <span className="preview-pet"><Art name="niumpi" size={54} /></span>
            </div>
            <dl className="preview-facts">
              <dt>Category</dt><dd>{itemMap[preview].category}</dd>
              <dt>In the room</dt><dd>{itemMap[preview].reaction ?? "Purely decorative"}</dd>
              <dt>Price</dt><dd>{itemMap[preview].price} {itemMap[preview].currency === "dewdrops" ? "dewdrops" : "star fragments"}</dd>
            </dl>
            {!state.inventory.items.includes(preview) && (
              <button className="primary-button" type="button"
                disabled={state.inventory.currencies[itemMap[preview].currency] < itemMap[preview].price}
                onClick={() => buy(preview)}>
                Buy it
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
