"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { motion } from "motion/react";
import Image from "next/image";
import type { PanInfo } from "motion/react";
import { Art } from "../ui/Art";
import { TabBar } from "../ui/parts";
import { useGame } from "../ui/GameProvider";
import { CompanionStage } from "../ui/CompanionStage";
import { ROOM_COLS, ROOM_ROWS, itemMap, roomCategories, roomThemes, shopItems } from "../game/config/items";
import { claimRoomDiscovery, playWithItem, roomActivity, saveRoom, switchRoom } from "../game/actions";
import { roomActivities, roomDefinitions } from "../game/config/rooms";
import { rarityDefinitions, rarityMap } from "../game/config/rarities";
import { roomFamiliarity, roomUnlockProgress } from "../game/rooms";
import { DISCOVERY_MOMENTS } from "../game/roomLoot";
import type { PlacedItem, RoomActivityId, RoomId } from "../game/types";

type Mode = "play" | "edit";

/** Undo/redo history is capped so a long decorating session stays lightweight. */
const HISTORY_LIMIT = 30;

const roomArt: Record<RoomId, string> = {
  "living-room": "cozy",
  bedroom: "moonlit",
  "play-nook": "playful",
};

const activityCopy: Record<RoomActivityId, { label: string; art: string }> = {
  read: { label: "Story time", art: "book" },
  window: { label: "Watch the clouds", art: "window" },
  rest: { label: "Cozy rest", art: "sleep" },
  roll: { label: "Floor roll", art: "loop" },
  dance: { label: "Little dance", art: "beat" },
  sing: { label: "Sing together", art: "note" },
};

export function RoomScene() {
  const { state, run, cue, toast, clock, goTo, controller, showReward } = useGame();
  const [mode, setMode] = useState<Mode>("play");
  const [category, setCategory] = useState<string>("all");
  const [theme, setTheme] = useState(state.room.theme);
  const [placed, setPlaced] = useState<PlacedItem[]>(state.room.placed);
  const [selected, setSelected] = useState<string | null>(null);
  const [past, setPast] = useState<PlacedItem[][]>([]);
  const [future, setFuture] = useState<PlacedItem[][]>([]);
  const grid = useRef<HTMLDivElement>(null);

  const activeTheme = roomThemes.find((entry) => entry.id === theme) ?? roomThemes[0];
  const activeRoom = state.room.rooms[state.room.activeRoomId];
  const activeRoomDefinition = roomDefinitions.find((entry) => entry.id === state.room.activeRoomId) ?? roomDefinitions[0];
  const familiarity = roomFamiliarity(activeRoom);
  const availableActivities = roomActivities.filter((activity) => activity.rooms.includes(state.room.activeRoomId));
  const selectedItem = selected ? placed.find((entry) => entry.uid === selected) : null;
  const dirty = useMemo(
    () => theme !== state.room.theme || JSON.stringify(placed) !== JSON.stringify(state.room.placed),
    [placed, state.room.placed, state.room.theme, theme],
  );

  const commit = useCallback((next: PlacedItem[]) => {
    setPast((history) => [...history, placed].slice(-HISTORY_LIMIT));
    setFuture([]);
    setPlaced(next);
  }, [placed]);

  const owned = state.inventory.items;
  const catalogue = shopItems.filter((item) => (
    item.category !== "accessories"
    && (category === "all" || item.category === category)
  ));
  const interactiveItems = placed.flatMap((entry) => {
    const item = itemMap[entry.itemId];
    return item?.reaction ? [{ entry, item }] : [];
  });

  /* The controller is shared between scenes. A room must always begin from
     its own safe floor anchor rather than inheriting a window/look offset from
     Home or another room. Room interactions can move it again afterwards. */
  useEffect(() => {
    controller.setPosition(0, 0);
    controller.setGaze(0, 0);
  }, [controller, state.room.activeRoomId]);

  /** Grid coordinates from a pointer position, clamped inside the room. */
  function cellAt(uid: string, clientX: number, clientY: number) {
    const box = grid.current?.getBoundingClientRect();
    if (!box) return null;
    const entry = placed.find((item) => item.uid === uid);
    const size = entry ? itemMap[entry.itemId]?.size ?? [1, 1] : [1, 1];
    return {
      x: Math.max(0, Math.min(ROOM_COLS - size[0], Math.floor(((clientX - box.left) / box.width) * ROOM_COLS))),
      y: Math.max(0, Math.min(ROOM_ROWS - size[1], Math.floor(((box.bottom - clientY) / box.height) * ROOM_ROWS))),
    };
  }

  /** Motion owns the drag; this only decides which cell it landed in. */
  function dropAt(uid: string, event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    const point = "clientX" in event ? { x: event.clientX, y: event.clientY } : info.point;
    const cell = cellAt(uid, point.x, point.y);
    if (!cell) return;
    commit(placed.map((entry) => (entry.uid === uid ? { ...entry, ...cell } : entry)));
  }

  /** Keyboard equivalent of dragging, so a pointer is never required. */
  function nudge(uid: string, dx: number, dy: number) {
    commit(placed.map((entry) => entry.uid === uid
      ? (() => {
          const size = itemMap[entry.itemId]?.size ?? [1, 1];
          return {
            ...entry,
            x: Math.max(0, Math.min(ROOM_COLS - size[0], entry.x + dx)),
            y: Math.max(0, Math.min(ROOM_ROWS - size[1], entry.y + dy)),
          };
        })()
      : entry));
  }

  function place(itemId: string) {
    const item = itemMap[itemId];
    if (!item || !owned.includes(itemId) || placed.some((entry) => entry.itemId === itemId)) return;
    const uid = `${itemId}-${clock()}`;
    commit([...placed, {
      uid,
      itemId,
      x: Math.max(0, Math.floor((ROOM_COLS - item.size[0]) / 2)),
      y: 1,
      flipped: false,
      layer: placed.length,
    }]);
    setSelected(uid);
    cue("tap");
  }

  function chooseTheme(nextTheme: string) {
    setTheme(nextTheme);
    cue("blip");
  }

  function enterRoom(roomId: RoomId) {
    if (roomId === state.room.activeRoomId || (mode === "edit" && dirty)) return;
    const result = run(switchRoom(state, roomId, clock()));
    if (result.refused) return;
    setTheme(result.state.room.theme);
    setPlaced(result.state.room.placed);
    setSelected(null);
    setPast([]);
    setFuture([]);
  }

  function resetDraft() {
    setPlaced(state.room.placed);
    setTheme(state.room.theme);
    setSelected(null);
    setPast([]);
    setFuture([]);
  }

  function saveDraft() {
    run(saveRoom(state, placed, theme, clock()));
    setPast([]);
    setFuture([]);
    setSelected(null);
    cue("chime");
    toast("Your room is saved", "✦");
  }

  function performActivity(activityId: RoomActivityId) {
    const result = roomActivity(state, activityId, clock());
    if (!result.refused) {
      const targetX: Partial<Record<RoomActivityId, number>> = { read: -62, window: 72, rest: 0, roll: 0, dance: 0, sing: 0 };
      const x = targetX[activityId] ?? 0;
      controller.setPosition(x, activityId === "window" ? -4 : 0);
      controller.setGaze(Math.sign(x) * 12, activityId === "window" ? -8 : -2);
    }
    run(result);
  }

  function performItem(entry: PlacedItem) {
    const item = itemMap[entry.itemId];
    const result = playWithItem(state, entry.itemId, clock());
    if (result.behavior && item) {
      const centre = entry.x + item.size[0] / 2;
      const x = Math.max(-78, Math.min(78, ((centre / ROOM_COLS) - .5) * 156));
      controller.setPosition(x, 0);
      controller.setGaze(Math.sign(x) * 11, -2);
    }
    run(result);
  }

  function openDiscovery() {
    const result = claimRoomDiscovery(state, clock());
    run(result);
    if (result.rewards.length) {
      const itemReward = result.rewards.find((reward) => reward.kind === "item");
      const item = itemReward?.kind === "item" ? itemMap[itemReward.id] : null;
      showReward(item ? `${rarityMap[item.rarity].name} discovery!` : "Collection complete", result.rewards, "Room Bloom");
    }
  }

  return (
    <div className={`scene scene-room scene-room-world mode-${mode}`}>
      <header className="scene-head rw-head">
        <div className="scene-title-block rw-title-block">
          <span className="rw-eyebrow"><Art name="spark" size={13} /> Niumpi&apos;s little world</span>
          <h1>Your Room</h1>
          <p>{mode === "play" ? "Tap a favourite thing and see what Niumpi does." : "Make a cozy place that feels like yours."}</p>
        </div>
        <div className="rw-mode-switch">
          <span className="rw-mode-hint" aria-hidden="true">{mode === "play" ? "Live room" : dirty ? "Unsaved changes" : "Room editor"}</span>
          <TabBar
            label="Room mode"
            active={mode}
            onSelect={(id) => {
              const nextMode = id as Mode;
              if (nextMode === "play" && mode === "edit" && dirty) {
                toast("Save or discard your room changes first", "✦");
                return;
              }
              setMode(nextMode);
              setSelected(null);
              cue("blip");
            }}
            tabs={[
              { id: "play", label: "Play" },
              { id: "edit", label: "Decorate" },
            ]}
          />
        </div>
      </header>

      <nav className="rw-room-picker" aria-label="Choose a room">
        {roomDefinitions.map((entry, index) => {
          const isActive = state.room.activeRoomId === entry.id;
          const progress = roomUnlockProgress(state, entry.id);
          const isLocked = !progress.open;
          const blockedByDraft = mode === "edit" && dirty && !isActive;
          return (
            <button
              key={entry.id}
              className={`rw-room-tab is-${entry.id} ${isActive ? "is-active" : ""}`}
              type="button"
              aria-pressed={isActive}
              aria-label={isLocked
                ? `${entry.name}, locked. ${progress.note}`
                : `${entry.name}. ${entry.note}${isActive ? ". Current room" : ""}`}
              aria-disabled={blockedByDraft || undefined}
              title={blockedByDraft ? "Save or discard your changes before switching rooms" : undefined}
              onClick={() => enterRoom(entry.id)}
            >
              <span className="rw-room-number" aria-hidden="true">0{index + 1}</span>
              <span className="rw-room-icon"><Art name={isLocked ? "lock" : roomArt[entry.id]} size={23} /></span>
              <span className="rw-room-copy">
                <strong>{entry.name}</strong>
                <small>{isLocked ? progress.note : entry.note}</small>
              </span>
              {isActive
                ? <span className="rw-saved-dot" title="Current room"><Art name="check" size={11} /></span>
                : isLocked && <span className="rw-lock-progress" aria-hidden="true"><i style={{ width: `${progress.percent}%` }} /></span>}
            </button>
          );
        })}
      </nav>

      <div className={`rw-workspace mode-${mode} theme-${theme}`}>
        <section className="rw-stage-card" aria-labelledby="rw-stage-title">
          <div className="rw-stage-topline">
            <div>
              <span className="rw-stage-kicker">{mode === "play" ? "Now playing" : "Arranging"}</span>
              <h2 id="rw-stage-title">{activeRoomDefinition.name}</h2>
            </div>
            <div className="rw-stage-actions">
              <span className="rw-object-count"><Art name="room" size={15} /> {placed.length} {placed.length === 1 ? "thing" : "things"}</span>
              {mode === "play" && (
                <button className="rw-edit-shortcut" type="button" onClick={() => {
                  setMode("edit");
                  setSelected(null);
                  cue("blip");
                }}>
                  <Art name="tidy" size={15} /> Move things
                </button>
              )}
            </div>
          </div>

          <div className={`room-canvas rw-canvas theme-${theme} room-${state.room.activeRoomId} mode-${mode}`}>
            <div className="rw-room-architecture" aria-hidden="true">
              <span className="rw-ceiling-glow" />
              <span className="rw-wall-stars"><i /><i /><i /><i /><i /></span>
              <span className="rw-built-window"><i /><b /><em /></span>
              <span className="rw-baseboard" />
              <span className="rw-floor" />
              <span className="rw-floor-light" />
            </div>

            <div
              className="room-grid rw-grid"
              ref={grid}
              role="group"
              aria-label={`${activeRoomDefinition.name}, ${activeTheme.name} style. ${mode === "edit" ? "Decoration grid. Select an item and use arrow keys to move it." : "Play space"}`}
            >
              {mode === "play" && (
                <div className="room-companion rw-companion">
                  <CompanionStage compact showBubble={false} />
                </div>
              )}

              {placed.map((entry) => {
                const item = itemMap[entry.itemId];
                if (!item) return null;
                const isSelected = selected === entry.uid;
                const itemStyle = {
                  left: `${(entry.x / ROOM_COLS) * 100}%`,
                  bottom: `${(entry.y / ROOM_ROWS) * 100}%`,
                  width: `${(item.size[0] / ROOM_COLS) * 100}%`,
                  height: `${(item.size[1] / ROOM_ROWS) * 100}%`,
                  zIndex: 10 + entry.y + entry.layer,
                } as CSSProperties;
                return (
                  <motion.button
                    key={entry.uid}
                    className={`room-item rw-item size-${item.size[0]}x${item.size[1]} rarity-${item.rarity} ${item.image ? "has-illustration" : ""} ${isSelected ? "is-selected" : ""} ${entry.flipped ? "is-flipped" : ""}`}
                    type="button"
                    style={itemStyle}
                    aria-label={mode === "edit"
                      ? `${item.name}, row ${entry.y + 1}, column ${entry.x + 1}. Use arrow keys to move, F to flip, or Delete to put away.`
                      : `${item.name}. ${item.reaction ?? item.note}`}
                    aria-pressed={mode === "edit" ? isSelected : undefined}
                    drag={mode === "edit"}
                    dragSnapToOrigin
                    dragMomentum={false}
                    dragElastic={0.12}
                    whileDrag={{ scale: 1.08, zIndex: 80 }}
                    whileHover={mode === "play" ? { y: -5 } : undefined}
                    whileTap={{ scale: 0.96 }}
                    onDragStart={() => setSelected(entry.uid)}
                    onDragEnd={(event, info) => dropAt(entry.uid, event, info)}
                    onClick={() => {
                      if (mode === "play") performItem(entry);
                      else setSelected(entry.uid);
                    }}
                    onKeyDown={(event) => {
                      if (mode !== "edit") return;
                      const moves: Record<string, [number, number]> = {
                        ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1],
                      };
                      const move = moves[event.key];
                      if (move) {
                        event.preventDefault();
                        setSelected(entry.uid);
                        nudge(entry.uid, move[0], move[1]);
                      } else if (event.key.toLowerCase() === "f") {
                        event.preventDefault();
                        commit(placed.map((candidate) => candidate.uid === entry.uid
                          ? { ...candidate, flipped: !candidate.flipped }
                          : candidate));
                      } else if (event.key === "Delete" || event.key === "Backspace") {
                        event.preventDefault();
                        commit(placed.filter((candidate) => candidate.uid !== entry.uid));
                        setSelected(null);
                      }
                    }}
                  >
                    <span className="rw-item-art">
                      {item.image ? <Image src={item.image} alt="" width={768} height={768} unoptimized draggable={false} /> : <Art name={item.art} size="100%" />}
                    </span>
                    <span className="rw-item-label">{item.name}</span>
                    <span className="rw-item-rarity" aria-hidden="true">{rarityMap[item.rarity].name}</span>
                    {mode === "edit" && <span className="rw-drag-handle" aria-hidden="true"><i /><i /><i /><i /></span>}
                    {mode === "play" && item.reaction && <span className="rw-item-spark" aria-hidden="true">✦</span>}
                  </motion.button>
                );
              })}

              {placed.length === 0 && (
                <div className="rw-room-empty">
                  <span><Art name="cushion" size={38} /></span>
                  <strong>A room waiting for you</strong>
                  <small>{mode === "edit" ? "Choose something from your collection below." : "Decorate it to give Niumpi a place to play."}</small>
                  {mode === "play" && <button type="button" onClick={() => setMode("edit")}>Start decorating</button>}
                </div>
              )}
            </div>
          </div>

          <footer className="rw-stage-footer">
            <span><Art name={mode === "play" ? "heart" : "tidy"} size={15} /> {mode === "play" ? "Every object has its own little reaction" : "Drag items or move them with the arrow keys"}</span>
            {mode === "edit" && selectedItem && (
              <span className="rw-selection-status" aria-live="polite">
                Selected: {itemMap[selectedItem.itemId]?.name}
              </span>
            )}
          </footer>
        </section>

        <aside className="rw-side" aria-label={mode === "edit" ? "Decoration tools" : "Room activities"}>
          {mode === "play" ? (
            <>
              <section className="rw-side-card rw-play-card">
                <header>
                  <span className="rw-card-art"><Art name="playful" size={20} /></span>
                  <div><h2>Little room moments</h2><p>Pick something for Niumpi to explore.</p></div>
                </header>
                {availableActivities.length || interactiveItems.length ? (
                  <ul className="rw-reaction-list">
                    {availableActivities.map((activity) => {
                      const copy = activityCopy[activity.id];
                      return (
                        <li key={`activity-${activity.id}`}>
                          <button type="button" onClick={() => performActivity(activity.id)}>
                            <span className="rw-reaction-art"><Art name={copy.art} size={25} /></span>
                            <span><strong>{copy.label}</strong><small>{activity.message}</small></span>
                            <Art name="spark" size={12} className="rw-reaction-spark" />
                          </button>
                        </li>
                      );
                    })}
                    {interactiveItems.map(({ entry, item }) => (
                      <li key={entry.uid}>
                        <button type="button" onClick={() => performItem(entry)}>
                          <span className={`rw-reaction-art rarity-${item.rarity}`}>
                            {item.image ? <Image src={item.image} alt="" width={96} height={96} unoptimized /> : <Art name={item.art} size={25} />}
                          </span>
                          <span><strong>{item.name}</strong><small>{item.reaction}</small></span>
                          <Art name="spark" size={12} className="rw-reaction-spark" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rw-side-empty">
                    <Art name="chest" size={34} />
                    <strong>No playthings here yet</strong>
                    <p>Decorate the room with something Niumpi can discover.</p>
                    <button type="button" onClick={() => setMode("edit")}>Decorate room</button>
                  </div>
                )}
              </section>

              <section className="rw-side-card rw-keepsake-card">
                <span className="rw-card-art"><Art name="leaf" size={20} /></span>
                <div className="rw-familiarity-copy">
                  <h2>Feels like home · Level {familiarity.level}</h2>
                  <p>{familiarity.nextAt === null ? "Niumpi knows every cozy corner." : `${familiarity.points} shared room moments`}</p>
                  <span className="rw-familiarity-track" role="progressbar" aria-label="Room familiarity" aria-valuemin={0} aria-valuemax={100} aria-valuenow={familiarity.percent}><i style={{ width: `${familiarity.percent}%` }} /></span>
                </div>
              </section>

              <section className={`rw-side-card rw-discovery-card ${state.roomLoot.claimable ? "is-ready" : ""}`}>
                <div className="rw-discovery-orb" aria-hidden="true"><span>✦</span><i /><b /></div>
                <div className="rw-discovery-copy">
                  <span className="rw-stage-kicker">Free room discovery</span>
                  <h2>{state.roomLoot.claimable ? "A Room Bloom is ready" : "Grow a Room Bloom"}</h2>
                  <p>{state.roomLoot.claimable
                    ? `${state.roomLoot.claimable} ${state.roomLoot.claimable === 1 ? "discovery" : "discoveries"} waiting. No purchases, no duplicates.`
                    : `${state.roomLoot.progress}/${DISCOVERY_MOMENTS} shared moments. Play, rest or decorate to grow it.`}</p>
                  <span className="rw-discovery-track" role="progressbar" aria-label="Room Bloom progress" aria-valuemin={0} aria-valuemax={DISCOVERY_MOMENTS} aria-valuenow={state.roomLoot.progress}>
                    <i style={{ width: `${state.roomLoot.claimable ? 100 : (state.roomLoot.progress / DISCOVERY_MOMENTS) * 100}%` }} />
                  </span>
                  <button type="button" disabled={!state.roomLoot.claimable} onClick={openDiscovery}>
                    <Art name="collect" size={16} /> {state.roomLoot.claimable ? "Open discovery" : `${DISCOVERY_MOMENTS - state.roomLoot.progress} moments to go`}
                  </button>
                  <details>
                    <summary>Fair drop rates</summary>
                    <ul>{rarityDefinitions.map((rarity) => <li key={rarity.id}><i style={{ background: rarity.colour }} />{rarity.name}<strong>{rarity.weight}%</strong></li>)}</ul>
                    <small>Rare+ by bloom 7 · Legendary+ by 20 · Mythic by 40.</small>
                  </details>
                </div>
              </section>
            </>
          ) : (
            <section className="rw-side-card rw-tools-card">
              <header>
                <span className="rw-card-art"><Art name="tidy" size={20} /></span>
                <div><h2>Room tools</h2><p>{selectedItem ? `Editing ${itemMap[selectedItem.itemId]?.name}` : "Select an object in the room."}</p></div>
              </header>
              <div className="rw-tool-grid">
                <button type="button" disabled={!past.length} onClick={() => {
                  const previous = past[past.length - 1];
                  setPast(past.slice(0, -1));
                  setFuture((entries) => [placed, ...entries]);
                  setPlaced(previous);
                }}><Art name="return" size={17} /> Undo</button>
                <button type="button" disabled={!future.length} onClick={() => {
                  const [next, ...rest] = future;
                  setFuture(rest);
                  setPast((history) => [...history, placed]);
                  setPlaced(next);
                }}><Art name="return" size={17} className="rw-redo-art" /> Redo</button>
                <button type="button" disabled={!selected} onClick={() => selected && commit(placed.map((entry) => (
                  entry.uid === selected ? { ...entry, flipped: !entry.flipped } : entry
                )))}><Art name="loop" size={17} /> Flip</button>
                <button type="button" disabled={!selected} onClick={() => {
                  if (!selected) return;
                  commit(placed.filter((entry) => entry.uid !== selected));
                  setSelected(null);
                }}><Art name="collect" size={17} /> Put away</button>
              </div>
              <div className="rw-theme-tools" aria-label="Room colour theme">
                <span>Colour mood</span>
                <div>
                  {roomThemes.map((entry) => (
                    <button
                      key={entry.id}
                      className={`rw-theme-swatch is-${entry.id} ${theme === entry.id ? "is-active" : ""}`}
                      type="button"
                      aria-label={`${entry.name}. ${entry.note}`}
                      aria-pressed={theme === entry.id}
                      onClick={() => chooseTheme(entry.id)}
                    ><Art name={entry.art} size={16} /> {entry.name}</button>
                  ))}
                </div>
              </div>
              <p className="rw-keyboard-note"><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> moves · <kbd>F</kbd> flips</p>
            </section>
          )}
        </aside>
      </div>

      {mode === "edit" && (
        <section className="rw-collection" aria-labelledby="rw-collection-title">
          <header className="rw-collection-head">
            <div>
              <span className="rw-eyebrow"><Art name="collect" size={13} /> Your collection</span>
              <h2 id="rw-collection-title">Furniture drawer</h2>
              <p>Tap an owned item to place it. New pieces come from free Room Blooms or direct Shop buys.</p>
            </div>
            <TabBar label="Furniture categories" active={category} onSelect={setCategory} tabs={roomCategories} />
          </header>

          <ul className="rw-inventory-list">
            {catalogue.map((item) => {
              const isOwned = owned.includes(item.id);
              const roomEntry = placed.find((entry) => entry.itemId === item.id);
              const elsewhere = roomDefinitions.find((room) => (
                room.id !== state.room.activeRoomId
                && state.room.rooms[room.id].placed.some((entry) => entry.itemId === item.id)
              ));
              return (
                <li key={item.id}>
                  <button
                    className={`rw-inventory-item rarity-${item.rarity} ${!isOwned ? "is-locked" : ""} ${roomEntry ? "is-placed" : ""}`}
                    type="button"
                    disabled={Boolean(roomEntry || elsewhere)}
                    aria-label={!isOwned
                      ? `${item.name}, locked. Open Shop to discover it.`
                      : roomEntry ? `${item.name}, already in this room`
                      : elsewhere ? `${item.name}, currently in ${elsewhere.name}` : `Place ${item.name}`}
                    onClick={() => {
                      if (!isOwned) { goTo("shop"); return; }
                      place(item.id);
                    }}
                  >
                    <span className="rw-inventory-art">
                      {isOwned && item.image ? <Image src={item.image} alt="" width={116} height={116} unoptimized /> : <Art name={isOwned ? item.art : "lock"} size={34} />}
                    </span>
                    <span className="rw-inventory-copy"><span className="rw-rarity-badge">{rarityMap[item.rarity].name}</span><strong>{item.name}</strong><small>{roomEntry ? "In this room" : elsewhere ? `In ${elsewhere.name}` : isOwned ? item.note : "Find in a Room Bloom or Shop"}</small></span>
                    <span className="rw-inventory-state" aria-hidden="true">
                      {roomEntry || elsewhere ? <Art name="check" size={13} /> : isOwned ? "+" : <Art name="lock" size={12} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {!catalogue.length && (
            <div className="rw-collection-empty">
              <Art name="collect" size={36} />
              <strong>Nothing in this drawer yet</strong>
              <p>Try another category or visit the Shop to find something new.</p>
            </div>
          )}
        </section>
      )}

      {mode === "edit" && (
        <div className={`rw-save-dock ${dirty ? "is-dirty" : ""}`} role="region" aria-label="Save room layout">
          <div className="rw-save-copy">
            <span className="rw-save-icon"><Art name={dirty ? "spark" : "check"} size={18} /></span>
            <span><strong>{dirty ? "Your new room is ready" : "Everything is tucked into place"}</strong><small>{dirty ? "Save it before going back to Play mode." : "Make a change whenever inspiration strikes."}</small></span>
          </div>
          <div className="rw-save-actions">
            <button className="rw-reset-button" type="button" disabled={!dirty} onClick={resetDraft}>Discard</button>
            <button className="rw-save-button" type="button" disabled={!dirty} onClick={saveDraft}><Art name="check" size={16} /> Save room</button>
          </div>
        </div>
      )}
    </div>
  );
}
