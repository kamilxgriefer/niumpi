"use client";

import { useState } from "react";
import Image from "next/image";
import { Art } from "../ui/Art";
import { CurrencyPill, Modal, TabBar } from "../ui/parts";
import { useGame } from "../ui/GameProvider";
import { shopCategories, shopItems, itemMap } from "../game/config/items";
import { buyItem } from "../game/inventory";
import { copy } from "../game/config/copy";
import { rarityMap } from "../game/config/rarities";
import {
  EPIC_PITY, LEGENDARY_PITY, WONDER_CHEST_PRICE, starPacks, starlightBundles, wonderDrops,
} from "../game/config/starlightShop";
import { buyStarlightBundle, openWonderChest } from "../game/starlightShop";
import { ingredientMap } from "../game/config/foods";
import { plantMap } from "../game/config/plants";
import type { Reward } from "../game/types";

type ShopSection = "collectibles" | "starlight" | "discovery";

function rewardCopy(reward: Reward): string {
  if (reward.kind === "ingredient") return `${ingredientMap[reward.id]?.name ?? reward.id} ×${reward.amount}`;
  if (reward.kind === "seed") return `${plantMap[reward.id]?.name ?? reward.id} seeds ×${reward.amount}`;
  if (reward.kind === "currency") return `${reward.amount} ${reward.id}`;
  return reward.kind;
}

export function ShopScene() {
  const { state, update, cue, toast, showReward, clock } = useGame();
  const [section, setSection] = useState<ShopSection>("collectibles");
  const [category, setCategory] = useState("all");
  const [preview, setPreview] = useState<string | null>(null);
  const [parentShop, setParentShop] = useState(false);

  const visible = shopItems.filter((item) => category === "all" || item.category === category);

  function buy(id: string) {
    const result = buyItem(state, id);
    if (!result.ok) { toast(result.reason, "✕"); cue("fail"); return; }
    update(result.state);
    cue("reward");
    toast(`${itemMap[id].name} is yours`, "✦");
    setPreview(null);
  }

  function buyBundle(id: string) {
    const bundle = starlightBundles.find((entry) => entry.id === id);
    const result = buyStarlightBundle(state, id);
    if (!result.ok) { toast(result.reason, "✕"); cue("fail"); return; }
    update(result.state);
    cue("reward");
    showReward(bundle?.name ?? "Starlight bundle", result.rewards, "Guaranteed contents");
  }

  function openChest() {
    const result = openWonderChest(state, clock());
    if (!result.ok) { toast(result.reason, "✕"); cue("fail"); return; }
    update(result.state);
    cue(result.drop?.tier === "legendary" ? "legendary" : result.drop?.tier === "rare" || result.drop?.tier === "epic" ? "rare" : "reward");
    showReward(result.drop?.name ?? "Wonder Chest", result.rewards, "Play-earned discovery");
  }

  return (
    <div className="scene scene-shop">
      <header className="scene-head shop-head">
        <div className="scene-title-block">
          <h1>{copy.nav.shop}</h1>
          <p>Choose exact favourites, guaranteed rare supplies, or a transparent play-earned discovery.</p>
        </div>
        <div className="shop-wallet-row">
          <div className="wallet">
            <CurrencyPill id="dewdrops" amount={state.inventory.currencies.dewdrops} />
            <CurrencyPill id="starFragments" amount={state.inventory.currencies.starFragments} />
          </div>
          <button className="shop-parent-entry" type="button" onClick={() => setParentShop(true)}>
            <Art name="star" size={15} /> For parents
          </button>
        </div>
      </header>

      <TabBar
        label="Shop sections"
        active={section}
        onSelect={(id) => setSection(id as ShopSection)}
        tabs={[
          { id: "collectibles", label: "Collectibles" },
          { id: "starlight", label: "Starlight Kits" },
          { id: "discovery", label: "Wonder Chest" },
        ]}
      />

      {section === "collectibles" && (
        <>
          <TabBar label="Shop categories" active={category} onSelect={setCategory} tabs={shopCategories} />
          <ul className="shop-grid">
            {visible.map((item) => {
              const owned = state.inventory.items.includes(item.id);
              const affordable = state.inventory.currencies[item.currency] >= item.price;
              return (
                <li key={item.id}>
                  <div className={`shop-card rarity-${item.rarity} ${owned ? "is-owned" : ""}`}>
                    <button className="shop-art" type="button" onClick={() => setPreview(item.id)} aria-label={`Preview ${item.name}`}>
                      {item.image ? <Image src={item.image} alt="" width={192} height={164} unoptimized /> : <Art name={item.art} size={44} />}
                    </button>
                    <span className="shop-rarity">{rarityMap[item.rarity].name}</span>
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
        </>
      )}

      {section === "starlight" && (
        <section className="starlight-shop" aria-labelledby="starlight-title">
          <header className="shop-feature-head">
            <span className="shop-feature-art"><Art name="star" size={28} /></span>
            <div><span className="shop-kicker">Guaranteed — never random</span><h2 id="starlight-title">Rare Starlight Kits</h2><p>Every card shows exactly what arrives. Stars are optional and weekly goals can earn them too.</p></div>
          </header>
          <ul className="starlight-grid">
            {starlightBundles.map((bundle) => {
              const affordable = state.inventory.currencies.starFragments >= bundle.price;
              return (
                <li key={bundle.id} className="starlight-card">
                  <span className="starlight-art"><Art name={bundle.art} size={36} /></span>
                  <strong>{bundle.name}</strong>
                  <small>{bundle.note}</small>
                  <ul className="bundle-contents" aria-label={`${bundle.name} contents`}>
                    {bundle.rewards.map((reward, index) => <li key={`${reward.kind}-${index}`}><Art name="check" size={11} /> {rewardCopy(reward)}</li>)}
                  </ul>
                  <button type="button" className="starlight-buy" disabled={!affordable} onClick={() => buyBundle(bundle.id)}>
                    <Art name="star" size={14} /> {bundle.price} Star Fragments
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {section === "discovery" && (
        <section className="wonder-shop" aria-labelledby="wonder-title">
          <div className="wonder-chest-card">
            <span className="wonder-chest-art" aria-hidden="true"><Art name="gift" size={52} /><i>✦</i><b>✧</b></span>
            <div className="wonder-chest-copy">
              <span className="shop-kicker">Play-earned currency only</span>
              <h2 id="wonder-title">Wonder Chest</h2>
              <p>A surprise parcel of harder-to-find food or garden seeds. Star Fragments and real money cannot open it.</p>
              <div className="pity-row">
                <span><strong>{Math.min(state.starlightShop.epicPity, EPIC_PITY - 1)}/{EPIC_PITY - 1}</strong> toward Epic guarantee</span>
                <span><strong>{Math.min(state.starlightShop.legendaryPity, LEGENDARY_PITY - 1)}/{LEGENDARY_PITY - 1}</strong> toward Legendary guarantee</span>
              </div>
              <button className="wonder-open" type="button" disabled={state.inventory.currencies.dewdrops < WONDER_CHEST_PRICE} onClick={openChest}>
                <Art name="dewdrop" size={17} /> Open for {WONDER_CHEST_PRICE} Dewdrops
              </button>
            </div>
          </div>

          <div className="wonder-odds">
            <header><div><span className="shop-kicker">Published base odds</span><h2>Every possible discovery</h2></div><p>Epic or better by chest {EPIC_PITY}. Legendary by chest {LEGENDARY_PITY}. A guarantee only improves these odds.</p></header>
            <ul>
              {wonderDrops.map((drop) => (
                <li key={drop.id} className={`odds-row rarity-${drop.tier}`}>
                  <span className="odds-art"><Art name={drop.art} size={20} /></span>
                  <span><strong>{drop.name}</strong><small>{drop.note}</small></span>
                  <em>{drop.tier}</em>
                  <b>{drop.weight}%</b>
                </li>
              ))}
            </ul>
            <p className="odds-total"><Art name="check" size={13} /> Published chances total 100%. Refreshing cannot reroll a result.</p>
          </div>
        </section>
      )}

      {preview && (
        <Modal title={itemMap[preview].name} note={itemMap[preview].note} onClose={() => setPreview(null)}>
          <div className="shop-preview">
            <div className="preview-room">
              <span className="preview-window" />
              <span className="preview-floor" />
              <span className="preview-piece">{itemMap[preview].image
                ? <Image src={itemMap[preview].image} alt="" width={236} height={224} unoptimized />
                : <Art name={itemMap[preview].art} size={70} />}</span>
              <span className="preview-pet"><Art name="niumpi" size={54} /></span>
            </div>
            <dl className="preview-facts">
              <dt>Category</dt><dd>{itemMap[preview].category}</dd>
              <dt>Rarity</dt><dd style={{ color: rarityMap[itemMap[preview].rarity].colour }}>{rarityMap[itemMap[preview].rarity].name}</dd>
              <dt>In the room</dt><dd>{itemMap[preview].reaction ?? "Purely decorative"}</dd>
              <dt>Price</dt><dd>{itemMap[preview].price} {itemMap[preview].currency === "dewdrops" ? "dewdrops" : "star fragments"}</dd>
            </dl>
            {!state.inventory.items.includes(preview) && (
              <button className="primary-button" type="button" disabled={state.inventory.currencies[itemMap[preview].currency] < itemMap[preview].price} onClick={() => buy(preview)}>Buy it</button>
            )}
          </div>
        </Modal>
      )}

      {parentShop && (
        <Modal title="For parents and guardians" note="Optional Star Fragment packs" onClose={() => setParentShop(false)}>
          <div className="parent-shop-intro">
            <Art name="heart" size={24} />
            <p>Star Fragments only buy items with guaranteed contents. They never open the Wonder Chest, and Niumpi can progress without a purchase.</p>
          </div>
          <ul className="star-pack-list">
            {starPacks.map((pack) => (
              <li key={pack.id}>
                <span><Art name="star" size={20} /><strong>{pack.stars} Star Fragments</strong><small>{pack.note}</small></span>
                <b>{pack.price}</b>
                <button type="button" disabled title="A payment provider and parental purchase flow must be connected first">Setup required</button>
              </li>
            ))}
          </ul>
          <p className="soft-note">Payments are intentionally disabled in this preview. Before launch this needs a real payment provider, clear tax-inclusive pricing, withdrawal/refund handling and parental purchase controls.</p>
        </Modal>
      )}
    </div>
  );
}
