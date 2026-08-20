"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { playNiumpiSound } from "./niumpiSounds";
import { RiggedNiumpi } from "./RiggedNiumpi";
import type { CareStyle, NiumpiBehavior } from "./RiggedNiumpi";

type Gesture = "tap" | "pet" | "hold" | "leaf";
type Need = "fullness" | "energy" | "joy";
type FoodId = "moonberry" | "cloudpuff" | "dewdrop";
type DayPeriod = "day" | "evening" | "night";
type PetMemory = {
  bond: number;
  interactions: Record<Gesture, number>;
  needs: Record<Need, number>;
  foods: Record<FoodId, number>;
  lastVisit: string;
  lastUpdated: string;
  sleeping: boolean;
  sleepStartedAt: string;
  lampOn: boolean;
  sleepSessions: number;
};

const STORAGE_KEY = "niumpi-memory-v2";
const DEFAULT_MEMORY: PetMemory = {
  bond: 32,
  interactions: { tap: 0, pet: 0, hold: 0, leaf: 0 },
  needs: { fullness: 72, energy: 80, joy: 75 },
  foods: { moonberry: 0, cloudpuff: 0, dewdrop: 0 },
  lastVisit: "",
  lastUpdated: "",
  sleeping: false,
  sleepStartedAt: "",
  lampOn: false,
  sleepSessions: 0,
};

const foods: Record<FoodId, { name: string; effects: Partial<Record<Need, number>> }> = {
  moonberry: { name: "Moonberry", effects: { fullness: 22, joy: 6 } },
  cloudpuff: { name: "Cloud puff", effects: { fullness: 14, energy: 10, joy: 4 } },
  dewdrop: { name: "Dewdrop", effects: { fullness: 8, energy: 16 } },
};

const tapReactions = ["Nium!", "Nium nium!", "That feels nice!", "Again!"];
const gestureLabels: Record<Gesture, string> = {
  tap: "tapping",
  pet: "petting",
  hold: "cuddling",
  leaf: "leaf touches",
};

const spontaneousBehaviors: NiumpiBehavior[] = [
  "wander", "wander", "float", "float", "spin", "curious", "curious", "happy", "sleepy",
];

const behaviorMessages: Partial<Record<NiumpiBehavior, string>> = {
  float: "What if the floor is optional?",
  spin: "Wheee—nium!",
  curious: "Hmm… what are you doing?",
  happy: "I just remembered that I like you!",
  sleepy: "Just resting my eyes…",
};

function readMemory(): PetMemory {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem("niumpi-memory-v1");
    if (!saved) return { ...DEFAULT_MEMORY, lastUpdated: new Date().toISOString() };
    const parsed = JSON.parse(saved) as Partial<PetMemory>;
    const lastUpdated = parsed.lastUpdated || parsed.lastVisit;
    const elapsedHours = lastUpdated
      ? Math.min(12, Math.max(0, (Date.now() - new Date(lastUpdated).getTime()) / 3_600_000))
      : 0;
    const savedNeeds = { ...DEFAULT_MEMORY.needs, ...parsed.needs };
    const sleeping = parsed.sleeping ?? false;
    return {
      bond: Math.max(0, Math.min(100, parsed.bond ?? DEFAULT_MEMORY.bond)),
      interactions: { ...DEFAULT_MEMORY.interactions, ...parsed.interactions },
      needs: {
        fullness: Math.max(25, savedNeeds.fullness - elapsedHours * (sleeping ? 1.3 : 2.5)),
        energy: sleeping
          ? Math.min(100, savedNeeds.energy + elapsedHours * 20)
          : Math.max(25, savedNeeds.energy - elapsedHours * 1.2),
        joy: sleeping ? savedNeeds.joy : Math.max(30, savedNeeds.joy - elapsedHours * 0.8),
      },
      foods: { ...DEFAULT_MEMORY.foods, ...parsed.foods },
      lastVisit: parsed.lastVisit ?? "",
      lastUpdated: new Date().toISOString(),
      sleeping,
      sleepStartedAt: parsed.sleepStartedAt ?? "",
      lampOn: parsed.lampOn ?? false,
      sleepSessions: parsed.sleepSessions ?? 0,
    };
  } catch {
    return { ...DEFAULT_MEMORY, lastUpdated: new Date().toISOString() };
  }
}

export function NiumpiScene() {
  const [message, setMessage] = useState("Touch me");
  const [memory, setMemory] = useState<PetMemory>(DEFAULT_MEMORY);
  const [isPressed, setIsPressed] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [behavior, setBehavior] = useState<NiumpiBehavior>("idle");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [draggingFood, setDraggingFood] = useState<{ food: FoodId; x: number; y: number } | null>(null);
  const [dayPeriod, setDayPeriod] = useState<DayPeriod>("day");
  const roomRef = useRef<HTMLElement>(null);
  const draggingFoodRef = useRef<FoodId | null>(null);
  const pointer = useRef<{
    startedAt: number;
    lastX: number;
    lastY: number;
    distance: number;
  } | null>(null);

  useEffect(() => {
    const loadMemory = window.setTimeout(() => {
      const saved = readMemory();
      setMemory(saved);
      setBehavior(saved.sleeping ? "asleep" : "idle");
      if (saved.sleeping) setPosition({ x: -64, y: 34 });
      setMessage(saved.sleeping ? "Zzz…" : saved.lastVisit ? "Nium! You came back!" : "Touch me");
      setIsLoaded(true);
    }, 0);
    return () => window.clearTimeout(loadMemory);
  }, []);

  useEffect(() => {
    function updateDayPeriod() {
      const hour = new Date().getHours();
      setDayPeriod(hour >= 7 && hour < 17 ? "day" : hour >= 17 && hour < 21 ? "evening" : "night");
    }
    const updateClock = window.setTimeout(updateDayPeriod, 0);
    const clock = window.setInterval(updateDayPeriod, 60_000);
    return () => {
      window.clearTimeout(updateClock);
      window.clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  }, [isLoaded, memory]);

  useEffect(() => {
    if (!isLoaded) return;
    const lifeTick = window.setInterval(() => {
      setMemory((current) => ({
        ...current,
        needs: {
          fullness: Math.max(25, current.needs.fullness - 0.2),
          energy: current.sleeping
            ? Math.min(100, current.needs.energy + 2.5)
            : Math.max(25, current.needs.energy - 0.1),
          joy: current.sleeping ? current.needs.joy : Math.max(30, current.needs.joy - 0.08),
        },
        lastUpdated: new Date().toISOString(),
      }));
    }, 8_000);
    return () => window.clearInterval(lifeTick);
  }, [isLoaded]);

  useEffect(() => {
    if (isPressed || memory.sleeping) return;
    if (behavior !== "idle") {
      const finishBehavior = window.setTimeout(() => {
        setBehavior("idle");
        setLook({ x: 0, y: 0 });
      }, behavior === "curious" ? 4600 : 3400);
      return () => window.clearTimeout(finishBehavior);
    }

    const beginBehavior = window.setTimeout(() => {
      let available = spontaneousBehaviors;
      if (memory.needs.energy < 38) available = ["sleepy", "sleepy", "curious", "wander"];
      else if (memory.needs.fullness < 38) available = ["curious", "curious", "sleepy", "wander"];
      else if (memory.needs.joy > 78) available = [...available, "happy", "happy", "spin"];
      const next = available[Math.floor(Math.random() * available.length)];
      setBehavior(next);
      if (next === "wander") {
        setPosition((current) => ({
          x: Math.max(-105, Math.min(105, current.x + (Math.random() * 160 - 80))),
          y: Math.round(Math.random() * 12),
        }));
      }
      if (memory.needs.fullness < 38 && next === "curious") setMessage("Nium… my tummy feels empty.");
      else if (behaviorMessages[next]) setMessage(behaviorMessages[next]!);
    }, 900 + Math.random() * 1500);

    return () => window.clearTimeout(beginBehavior);
  }, [behavior, isPressed, memory.needs.energy, memory.needs.fullness, memory.needs.joy, memory.sleeping]);

  function startSleep() {
    const now = new Date().toISOString();
    setMemory((current) => ({
      ...current,
      sleeping: true,
      sleepStartedAt: now,
      sleepSessions: current.sleepSessions + 1,
      lastUpdated: now,
    }));
    setBehavior("asleep");
    setPosition({ x: -64, y: 34 });
    setLook({ x: 0, y: 0 });
    setMessage("Nium… good night.");
    if (soundEnabled) playNiumpiSound("sleep");
  }

  function wakeUp() {
    setMemory((current) => ({
      ...current,
      sleeping: false,
      sleepStartedAt: "",
      lastUpdated: new Date().toISOString(),
    }));
    setBehavior("happy");
    setPosition({ x: 0, y: 0 });
    setMessage("Good morning—nium!");
    if (soundEnabled) playNiumpiSound("wake");
  }

  function toggleLamp() {
    setMemory((current) => ({
      ...current,
      lampOn: !current.lampOn,
      lastUpdated: new Date().toISOString(),
    }));
  }

  function remember(gesture: Gesture, bondGain: number) {
    setMemory((current) => ({
      ...current,
      bond: Math.min(100, current.bond + bondGain),
      interactions: {
        ...current.interactions,
        [gesture]: current.interactions[gesture] + 1,
      },
      needs: { ...current.needs, joy: Math.min(100, current.needs.joy + (gesture === "pet" ? 5 : 2)) },
      lastVisit: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    }));
  }

  function beginTouch(event: PointerEvent<HTMLButtonElement>) {
    if (memory.sleeping) {
      wakeUp();
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = {
      startedAt: performance.now(),
      lastX: event.clientX,
      lastY: event.clientY,
      distance: 0,
    };
    setIsPressed(true);
    setBehavior("idle");
    setMessage("Mmm…");
  }

  function moveTouch(event: PointerEvent<HTMLButtonElement>) {
    if (!pointer.current) return;
    pointer.current.distance += Math.hypot(
      event.clientX - pointer.current.lastX,
      event.clientY - pointer.current.lastY,
    );
    pointer.current.lastX = event.clientX;
    pointer.current.lastY = event.clientY;
    if (pointer.current.distance > 28) setMessage("Niuuum… that feels lovely!");
  }

  function endTouch() {
    if (!pointer.current) return;
    const duration = performance.now() - pointer.current.startedAt;
    const distance = pointer.current.distance;
    setIsPressed(false);

    if (distance > 28) {
      remember("pet", 8);
      setMessage("I love when you pet me!");
      if (soundEnabled) playNiumpiSound("pet");
    } else if (duration >= 650) {
      remember("hold", 7);
      setMessage("Can we stay like this?");
      if (soundEnabled) playNiumpiSound("hold");
    } else {
      remember("tap", 4);
      setMessage(tapReactions[Math.floor(Math.random() * tapReactions.length)]);
      if (soundEnabled) playNiumpiSound("tap");
    }
    pointer.current = null;
  }

  function touchLeaf() {
    if (memory.sleeping) {
      wakeUp();
      return;
    }
    remember("leaf", 5);
    setMessage("Ting! My leaf can feel you!");
    if (soundEnabled) playNiumpiSound("leaf");
  }

  function followPointer(event: PointerEvent<HTMLElement>) {
    if (behavior !== "curious" && !draggingFoodRef.current) return;
    const room = event.currentTarget.getBoundingClientRect();
    setLook({
      x: Math.max(-18, Math.min(18, (event.clientX - room.left - room.width / 2) * 0.08)),
      y: Math.max(-10, Math.min(10, (event.clientY - room.top - room.height / 2) * 0.05)),
    });
  }

  function beginFoodDrag(event: PointerEvent<HTMLButtonElement>, food: FoodId) {
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingFoodRef.current = food;
    setDraggingFood({ food, x: event.clientX, y: event.clientY });
    setBehavior("curious");
    setMessage(`Is that a ${foods[food].name.toLowerCase()}?`);
  }

  function moveFoodDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!draggingFoodRef.current) return;
    setDraggingFood({ food: draggingFoodRef.current, x: event.clientX, y: event.clientY });
    if (roomRef.current) {
      const room = roomRef.current.getBoundingClientRect();
      setLook({
        x: Math.max(-18, Math.min(18, (event.clientX - room.left - room.width / 2) * 0.08)),
        y: Math.max(-10, Math.min(10, (event.clientY - room.top - room.height / 2) * 0.05)),
      });
    }
  }

  function endFoodDrag(event: PointerEvent<HTMLButtonElement>) {
    const food = draggingFoodRef.current;
    draggingFoodRef.current = null;
    setDraggingFood(null);
    const rig = roomRef.current?.querySelector(".rig-root")?.getBoundingClientRect();
    const wasFed = Boolean(
      food && rig && event.clientX >= rig.left && event.clientX <= rig.right && event.clientY >= rig.top && event.clientY <= rig.bottom,
    );

    if (!food || !wasFed) {
      setMessage("Almost! Bring it closer to me.");
      setBehavior("idle");
      setLook({ x: 0, y: 0 });
      return;
    }

    const meal = foods[food];
    setMemory((current) => ({
      ...current,
      needs: {
        fullness: Math.min(100, current.needs.fullness + (meal.effects.fullness ?? 0)),
        energy: Math.min(100, current.needs.energy + (meal.effects.energy ?? 0)),
        joy: Math.min(100, current.needs.joy + (meal.effects.joy ?? 0)),
      },
      foods: { ...current.foods, [food]: current.foods[food] + 1 },
      lastUpdated: new Date().toISOString(),
    }));
    setBehavior("happy");
    setLook({ x: 0, y: 0 });
    setMessage(`Nium! ${meal.name} is delicious!`);
    if (soundEnabled) playNiumpiSound("eat");
  }

  const favorite = (Object.entries(memory.interactions) as [Gesture, number][])
    .sort((a, b) => b[1] - a[1])[0];
  const totalInteractions = Object.values(memory.interactions).reduce(
    (sum, count) => sum + count,
    0,
  );
  const totalMeals = Object.values(memory.foods).reduce((sum, count) => sum + count, 0);
  const carePoints = totalInteractions + totalMeals * 2 + memory.sleepSessions * 2;
  const careScores = {
    playful: memory.interactions.tap,
    restful: memory.sleepSessions * 2,
    explorer: memory.interactions.leaf,
    affection: memory.interactions.pet + memory.interactions.hold,
  };
  const scoreValues = Object.values(careScores);
  const activeStyles = scoreValues.filter((score) => score > 0).length;
  const highestCareScore = Math.max(...scoreValues);
  const lowestActiveScore = Math.min(...scoreValues.filter((score) => score > 0));
  const careStyle: CareStyle = carePoints < 5 || highestCareScore === 0
    ? "growing"
    : activeStyles >= 3 && highestCareScore - lowestActiveScore <= 2
      ? "chaotic"
      : (Object.entries(careScores).sort((a, b) => b[1] - a[1])[0][0] as CareStyle);
  const careStyleDetails: Record<CareStyle, { name: string; note: string; symbol: string }> = {
    growing: { name: "Still discovering", note: "Your care will shape the leaves", symbol: "◌" },
    playful: { name: "Playful bond", note: "The leaves bounce with your energy", symbol: "✦" },
    restful: { name: "Dreamy bond", note: "The leaves glow softly after rest", symbol: "☾" },
    explorer: { name: "Curious bond", note: "Patterns grow from discovery", symbol: "⌁" },
    affection: { name: "Tender bond", note: "The leaves lean toward a heart", symbol: "♡" },
    chaotic: { name: "Wild-hearted bond", note: "Every leaf grows its own way", symbol: "≈" },
  };
  const growthStage: 1 | 2 | 3 | 4 = carePoints >= 60 ? 4 : carePoints >= 30 ? 3 : carePoints >= 10 ? 2 : 1;
  const stageFloor = growthStage === 1 ? 0 : growthStage === 2 ? 10 : growthStage === 3 ? 30 : 60;
  const nextStageAt = growthStage === 1 ? 10 : growthStage === 2 ? 30 : growthStage === 3 ? 60 : 60;
  const growthProgress = growthStage === 4 ? 100 : ((carePoints - stageFloor) / (nextStageAt - stageFloor)) * 100;
  const growthNames = ["", "Tiny seed", "Brave sprout", "Little explorer", "True companion"];

  return (
    <main className="game-shell">
      <header className="game-header">
        <div>
          <p className="eyebrow"><span aria-hidden="true">✦</span> Your little companion</p>
          <h1>N<span className="logo-i">ı</span>ump<span className="logo-i">ı</span></h1>
        </div>
        <div className="header-actions">
          <button
            className="sound-toggle"
            type="button"
            aria-pressed={soundEnabled}
            onClick={() => setSoundEnabled((enabled) => !enabled)}
          >
            Sound {soundEnabled ? "on" : "off"}
          </button>
          <div className="bond" aria-label={`Bond ${memory.bond} percent`}>
            <span>Bond</span>
            <div className="bond-track">
              <div className="bond-fill" style={{ width: `${memory.bond}%` }} />
            </div>
          </div>
        </div>
      </header>

      <section
        ref={roomRef}
        className={`pet-room room-${dayPeriod} ${memory.lampOn ? "lamp-on" : ""} ${memory.sleeping ? "is-sleeping" : ""}`}
        aria-label="Niumpi's room"
        onPointerMove={followPointer}
      >
        <div className="room-window" aria-hidden="true">
          <span className="sky-orb" />
          <span className="room-star star-one" />
          <span className="room-star star-two" />
          <span className="room-star star-three" />
        </div>
        <div className="sleep-nest" aria-hidden="true" />
        <p className="speech" aria-live="polite">{message}</p>

        <div className="needs-panel" aria-label="Niumpi's needs">
          {(Object.entries(memory.needs) as [Need, number][]).map(([need, value]) => (
            <div className={`need need-${need}`} key={need}>
              <span className="need-label">
                <span className="need-icon" aria-hidden="true">{need === "fullness" ? "●" : need === "energy" ? "✦" : "♥"}</span>
                {need === "fullness" ? "Fullness" : need[0].toUpperCase() + need.slice(1)}
              </span>
              <div className="need-track"><span style={{ width: `${value}%` }} /></div>
            </div>
          ))}
        </div>

        <RiggedNiumpi
          behavior={behavior}
          growthStage={growthStage}
          careStyle={careStyle}
          isPressed={isPressed}
          position={position}
          look={look}
          onLeafTouch={touchLeaf}
          onPointerDown={beginTouch}
          onPointerMove={moveTouch}
          onPointerUp={endTouch}
        />

        <div className="memory-note" aria-live="polite">
          <span><b aria-hidden="true">✦</b>{totalInteractions} shared moments</span>
          <span><b aria-hidden="true">♡</b>{totalInteractions ? `Favorite: ${gestureLabels[favorite[0]]}` : "Still learning about you"}</span>
        </div>
        <div className="growth-card" aria-label={`Growth stage ${growthStage}: ${growthNames[growthStage]}`}>
          <div className="growth-copy">
            <span>Stage {growthStage}</span>
            <strong>{growthNames[growthStage]}</strong>
          </div>
          <div className="growth-track" aria-hidden="true"><span style={{ width: `${growthProgress}%` }} /></div>
          <span className="growth-next">{growthStage === 4 ? "Fully grown together" : `${nextStageAt - carePoints} care moments to grow`}</span>
        </div>
        <div className={`care-signature care-signature-${careStyle}`} aria-live="polite">
          <span className="care-symbol" aria-hidden="true">{careStyleDetails[careStyle].symbol}</span>
          <span><strong>{careStyleDetails[careStyle].name}</strong>{careStyleDetails[careStyle].note}</span>
        </div>
        <p className="hint">Tap, hold, pet, or touch the leaf</p>
        <div className="food-tray" aria-label="Food tray">
          <p className="tray-label">Snack bar <span>Drag a treat to Niumpi</span></p>
          {(Object.entries(foods) as [FoodId, (typeof foods)[FoodId]][]).map(([food, details]) => (
            <button
              className="food-button"
              type="button"
              key={food}
              disabled={memory.sleeping}
              aria-label={`Drag ${details.name} to Niumpi`}
              onPointerDown={(event) => beginFoodDrag(event, food)}
              onPointerMove={moveFoodDrag}
              onPointerUp={endFoodDrag}
              onPointerCancel={endFoodDrag}
            >
              <span className={`food-icon food-${food}`} aria-hidden="true" />
              <span>{details.name}</span>
            </button>
          ))}
        </div>
        <div className="room-controls" aria-label="Room controls">
          <button type="button" onClick={toggleLamp} aria-pressed={memory.lampOn}>
            <span aria-hidden="true">◐</span>{memory.lampOn ? "Lamp off" : "Lamp on"}
          </button>
          <button type="button" onClick={memory.sleeping ? wakeUp : startSleep}>
            <span aria-hidden="true">☾</span>{memory.sleeping ? "Wake gently" : "Tuck in"}
          </button>
        </div>
        {draggingFood && (
          <span
            className={`food-follower food-icon food-${draggingFood.food}`}
            style={{ "--food-x": `${draggingFood.x}px`, "--food-y": `${draggingFood.y}px` } as CSSProperties}
            aria-hidden="true"
          />
        )}
      </section>
    </main>
  );
}
