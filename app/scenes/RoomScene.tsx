"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import type { PanInfo } from "motion/react";
import { Art } from "../ui/Art";
import { EmptyState, Panel, TabBar } from "../ui/parts";
import { useGame } from "../ui/GameProvider";
import { CompanionStage } from "../ui/CompanionStage";
import { ROOM_COLS, ROOM_ROWS, itemMap, roomCategories, roomThemes, shopItems } from "../game/config/items";
import { saveRoom, playWithItem } from "../game/actions";
import type { PlacedItem } from "../game/types";

type Mode = "play" | "edit";

/** Undo/redo history is capped so a long session cannot grow without bound. */
const HISTORY_LIMIT = 30;

export function RoomScene() {
  const { state, run, cue, toast, clock } = useGame();
  const [mode, setMode] = useState<Mode>("play");
  const [category, setCategory] = useState<string>("all");
  const [theme, setTheme] = useState(state.room.theme);
  const [placed, setPlaced] = useState<PlacedItem[]>(state.room.placed);
  const [selected, setSelected] = useState<string | null>(null);
  const [past, setPast] = useState<PlacedItem[][]>([]);
  const [future, setFuture] = useState<PlacedItem[][]>([]);
  const grid = useRef<HTMLDivElement>(null);

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
  const inventory = shopItems.filter(
    (item) => owned.includes(item.id) && (category === "all" || item.category === category),
  );
  const unplaced = inventory.filter((item) => !placed.some((entry) => entry.itemId === item.id));

  /** Grid coordinates from a pointer position, clamped inside the room. */
  function cellAt(clientX: number, clientY: number) {
    const box = grid.current?.getBoundingClientRect();
    if (!box) return null;
    return {
      x: Math.max(0, Math.min(ROOM_COLS - 1, Math.floor(((clientX - box.left) / box.width) * ROOM_COLS))),
      y: Math.max(0, Math.min(ROOM_ROWS - 1, Math.floor(((box.bottom - clientY) / box.height) * ROOM_ROWS))),
    };
  }

  /** Framer Motion drives the drag; this only decides which cell it landed in. */
  function dropAt(uid: string, event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    const point = "clientX" in event ? { x: event.clientX, y: event.clientY } : info.point;
    const cell = cellAt(point.x, point.y);
    if (!cell) return;
    commit(placed.map((entry) => (entry.uid === uid ? { ...entry, ...cell } : entry)));
  }

  /** Keyboard equivalent of dragging, so a mouse is never required. */
  function nudge(uid: string, dx: number, dy: number) {
    commit(placed.map((entry) => entry.uid === uid
      ? {
          ...entry,
          x: Math.max(0, Math.min(ROOM_COLS - 1, entry.x + dx)),
          y: Math.max(0, Math.min(ROOM_ROWS - 1, entry.y + dy)),
        }
      : entry));
  }

  return (
    <div className="scene scene-room">
      <header className="scene-head">
        <div>
          <h1>Your Room</h1>
          <p>Decorate, play and make it cozy.</p>
        </div>
        <TabBar
          label="Room mode" active={mode} onSelect={(id) => setMode(id as Mode)}
          tabs={[{ id: "play", label: "Play" }, { id: "edit", label: "Edit" }]}
        />
      </header>

      <div className={`room-canvas theme-${theme} mode-${mode}`}>
        <div className="room-grid" ref={grid}>
          {mode === "play" && (
            <div className="room-companion">
              <CompanionStage compact showBubble={false} />
            </div>
          )}
          {placed.map((entry) => {
            const item = itemMap[entry.itemId];
            if (!item) return null;
            return (
              <motion.button
                key={entry.uid}
                className={`room-item ${selected === entry.uid ? "is-selected" : ""} ${entry.flipped ? "is-flipped" : ""}`}
                type="button"
                style={{
                  left: `${(entry.x / ROOM_COLS) * 100}%`,
                  bottom: `${(entry.y / ROOM_ROWS) * 100}%`,
                  width: `${(item.size[0] / ROOM_COLS) * 100}%`,
                  zIndex: 10 + entry.y,
                }}
                aria-label={mode === "edit" ? `${item.name}, row ${entry.y + 1}, column ${entry.x + 1}` : item.name}
                drag={mode === "edit"}
                dragSnapToOrigin
                dragMomentum={false}
                dragElastic={0.16}
                whileDrag={{ scale: 1.12, zIndex: 80 }}
                whileHover={mode === "play" ? { y: -4 } : undefined}
                whileTap={{ scale: 0.96 }}
                onDragStart={() => setSelected(entry.uid)}
                onDragEnd={(event, info) => dropAt(entry.uid, event, info)}
                onClick={() => {
                  if (mode === "play") run(playWithItem(state, entry.itemId, clock()));
                  else setSelected(entry.uid);
                }}
                onKeyDown={(event) => {
                  if (mode !== "edit") return;
                  const moves: Record<string, [number, number]> = {
                    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1],
                  };
                  const move = moves[event.key];
                  if (move) { event.preventDefault(); nudge(entry.uid, move[0], move[1]); }
                }}
              >
                <Art name={item.art} size={44} />
              </motion.button>
            );
          })}
        </div>
      </div>

      {mode === "edit" && (
        <div className="edit-bar">
          <button className="ghost-button" type="button" disabled={!past.length}
            onClick={() => {
              const previous = past[past.length - 1];
              setPast(past.slice(0, -1));
              setFuture((entries) => [placed, ...entries]);
              setPlaced(previous);
            }}>Undo</button>
          <button className="ghost-button" type="button" disabled={!future.length}
            onClick={() => {
              const [next, ...rest] = future;
              setFuture(rest);
              setPast((history) => [...history, placed]);
              setPlaced(next);
            }}>Redo</button>
          <button className="ghost-button" type="button" disabled={!selected}
            onClick={() => selected && commit(placed.map((entry) =>
              entry.uid === selected ? { ...entry, flipped: !entry.flipped } : entry))}>Flip</button>
          <button className="ghost-button" type="button" disabled={!selected}
            onClick={() => { if (selected) { commit(placed.filter((entry) => entry.uid !== selected)); setSelected(null); } }}>
            Put away
          </button>
          <button className="ghost-button" type="button" disabled={!dirty}
            onClick={() => { setPlaced(state.room.placed); setTheme(state.room.theme); setPast([]); setFuture([]); }}>
            Reset
          </button>
          <button className="primary-button" type="button" disabled={!dirty}
            onClick={() => { run(saveRoom(state, placed, theme, clock())); cue("chime"); toast("Room saved", "✦"); }}>
            Save layout
          </button>
        </div>
      )}

      {mode === "edit" && (
        <Panel title="Your things" note="Tap to place, drag or use arrow keys to move" art="collect">
          <TabBar label="Categories" active={category} onSelect={setCategory} tabs={roomCategories} />
          {unplaced.length === 0 ? (
            <EmptyState art="shop" title="Everything is already out" note="Buy more in the Shop." />
          ) : (
            <ul className="item-grid">
              {unplaced.map((item) => (
                <li key={item.id}>
                  <button
                    className="item-card"
                    type="button"
                    onClick={() => commit([...placed, {
                      uid: `${item.id}-${clock()}`, itemId: item.id, x: 3, y: 1, flipped: false, layer: placed.length,
                    }])}
                  >
                    <Art name={item.art} size={34} />
                    <strong>{item.name}</strong>
                    <small>{item.reaction ?? item.note}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="theme-row">
            {roomThemes.map((entry) => (
              <button key={entry.id} className={`theme-chip ${theme === entry.id ? "is-active" : ""}`}
                type="button" onClick={() => setTheme(entry.id)}>
                <Art name={entry.art} size={18} /> {entry.name}
              </button>
            ))}
          </div>
        </Panel>
      )}

      {mode === "play" && (
        <Panel title="What's in here" note="Tap anything to see what Niumpi does with it" art="room">
          <ul className="reaction-list">
            {placed.map((entry) => {
              const item = itemMap[entry.itemId];
              if (!item?.reaction) return null;
              return (
                <li key={entry.uid}>
                  <button className="reaction-row" type="button" onClick={() => run(playWithItem(state, entry.itemId, clock()))}>
                    <Art name={item.art} size={22} />
                    <span><strong>{item.name}</strong><small>{item.reaction}</small></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}
