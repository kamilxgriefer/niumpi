"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, PointerEvent } from "react";
import { ActionBar } from "./ActionBar";
import { BuddyCard } from "./BuddyCard";
import { GameHeader } from "./GameHeader";
import { GrowthCard } from "./GrowthCard";
import { Onboarding } from "./Onboarding";
import { PersonalityBanner } from "./PersonalityBanner";
import { RoomWindow } from "./RoomWindow";
import { SnackBar } from "./SnackBar";
import { SpeechBubble } from "./SpeechBubble";
import { StatsCard } from "./StatsCard";
import { Toasts } from "./Toasts";
import type { Toast } from "./Toasts";
import { playNiumpiSound } from "./niumpiSounds";
import { RiggedNiumpi } from "./RiggedNiumpi";
import type { CareStyle, NiumpiBehavior } from "./RiggedNiumpi";
import {
  careStyleDetails,
  dayPeriodFor,
  foods,
  gestureLabels,
  gestureSparks,
  growthNames,
  growthProgressFor,
  growthStageFor,
} from "./gameConfig";
import type { DayPeriod, FoodId, Gesture, Need } from "./gameConfig";
import {
  DEFAULT_IDENTITY,
  isFirstCareToday,
  lastCareLabel,
  relationshipFor,
  sanitizeName,
  sanitizeTagline,
  startOfDay,
  vibeBehaviors,
  vibeOrder,
  vibes,
} from "./identity";
import type { PetIdentity, Relationship } from "./identity";

type SoundCue = Parameters<typeof playNiumpiSound>[0];
type Spark = { id: number; symbol: string; offset: number; delay: number };
type PetMemory = {
  identity: PetIdentity;
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

const STORAGE_KEY = "niumpi-memory-v3";
const LEGACY_STORAGE_KEYS = ["niumpi-memory-v2", "niumpi-memory-v1"];
const TOAST_LIFE = 2600;
const SPARK_LIFE = 1500;
const DRAG_SLOP = 10;

const DEFAULT_MEMORY: PetMemory = {
  identity: DEFAULT_IDENTITY,
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

const tapReactions = ["Nium!", "Nium nium!", "That feels nice!", "Again!"];

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

/** Pointer capture keeps a gesture alive off-target; losing it must not stop the gesture. */
function capturePointer(event: PointerEvent<HTMLButtonElement>) {
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
  } catch {
    // Some browsers reject capture mid-gesture — the gesture still works without it.
  }
}

function readIdentity(saved: Partial<PetIdentity> | undefined): PetIdentity {
  if (!saved) return DEFAULT_IDENTITY;
  const name = sanitizeName(saved.name ?? "").trim();
  const tagline = sanitizeTagline(saved.tagline ?? "").trim();
  return {
    name: name || DEFAULT_IDENTITY.name,
    tagline: tagline || DEFAULT_IDENTITY.tagline,
    vibe: saved.vibe && vibeOrder.includes(saved.vibe) ? saved.vibe : DEFAULT_IDENTITY.vibe,
    bornAt: saved.bornAt ?? "",
    onboarded: saved.onboarded ?? false,
  };
}

function readStoredMemory(): string | null {
  for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
    const saved = window.localStorage.getItem(key);
    if (saved) return saved;
  }
  return null;
}

function readMemory(): PetMemory {
  try {
    const saved = readStoredMemory();
    if (!saved) return { ...DEFAULT_MEMORY, lastUpdated: new Date().toISOString() };
    const parsed = JSON.parse(saved) as Partial<PetMemory>;
    const lastUpdated = parsed.lastUpdated || parsed.lastVisit;
    const elapsedHours = lastUpdated
      ? Math.min(12, Math.max(0, (Date.now() - new Date(lastUpdated).getTime()) / 3_600_000))
      : 0;
    const savedNeeds = { ...DEFAULT_MEMORY.needs, ...parsed.needs };
    const sleeping = parsed.sleeping ?? false;
    return {
      identity: readIdentity(parsed.identity),
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
  const [armedFood, setArmedFood] = useState<FoodId | null>(null);
  const [dayPeriod, setDayPeriod] = useState<DayPeriod>("day");
  const [todayStamp, setTodayStamp] = useState(0);
  const [isEditingIdentity, setIsEditingIdentity] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [bondPulse, setBondPulse] = useState(false);
  const roomRef = useRef<HTMLElement>(null);
  const draggingFoodRef = useRef<FoodId | null>(null);
  const foodPointer = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const skipFoodClick = useRef(false);
  const feedbackId = useRef(0);
  const bondPulseTimer = useRef<number | undefined>(undefined);
  const feedbackTimers = useRef<number[]>([]);
  const milestone = useRef<{ stage: number; style: CareStyle; bond: Relationship["key"] } | null>(null);
  const pointer = useRef<{
    startedAt: number;
    lastX: number;
    lastY: number;
    distance: number;
  } | null>(null);

  const identity = memory.identity;

  const playCue = useCallback(
    (cue: SoundCue) => {
      if (soundEnabled) playNiumpiSound(cue);
    },
    [soundEnabled],
  );

  /** Fire-and-forget cleanup that survives unmount and never grows the timer list. */
  const scheduleCleanup = useCallback((run: () => void, delay: number) => {
    const timer = window.setTimeout(() => {
      feedbackTimers.current = feedbackTimers.current.filter((pending) => pending !== timer);
      run();
    }, delay);
    feedbackTimers.current.push(timer);
  }, []);

  const pushToast = useCallback(
    (text: string, icon: string) => {
      feedbackId.current += 1;
      const id = feedbackId.current;
      setToasts((current) => [...current, { id, text, icon }].slice(-3));
      scheduleCleanup(() => setToasts((current) => current.filter((toast) => toast.id !== id)), TOAST_LIFE);
    },
    [scheduleCleanup],
  );

  const burstSparks = useCallback(
    (symbol: string) => {
      const created = [0, 1, 2].map((index) => {
        feedbackId.current += 1;
        return {
          id: feedbackId.current,
          symbol,
          offset: Math.round(Math.random() * 84 - 42),
          delay: index * 110,
        };
      });
      setSparks((current) => [...current, ...created].slice(-12));
      const born = new Set(created.map((spark) => spark.id));
      scheduleCleanup(() => setSparks((current) => current.filter((spark) => !born.has(spark.id))), SPARK_LIFE);
    },
    [scheduleCleanup],
  );

  const pulseBond = useCallback(() => {
    setBondPulse(true);
    window.clearTimeout(bondPulseTimer.current);
    bondPulseTimer.current = window.setTimeout(() => setBondPulse(false), 760);
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(bondPulseTimer.current);
      feedbackTimers.current.forEach((timer) => window.clearTimeout(timer));
      feedbackTimers.current = [];
    },
    [],
  );

  useEffect(() => {
    const loadMemory = window.setTimeout(() => {
      const saved = readMemory();
      setMemory(saved);
      setBehavior(saved.sleeping ? "asleep" : "idle");
      if (saved.sleeping) setPosition({ x: -64, y: 34 });
      setMessage(
        saved.sleeping
          ? "Zzz…"
          : saved.identity.onboarded
            ? saved.lastVisit
              ? "Nium! You came back!"
              : vibes[saved.identity.vibe].greeting
            : "…nium?",
      );
      setIsLoaded(true);
    }, 0);
    return () => window.clearTimeout(loadMemory);
  }, []);

  useEffect(() => {
    function updateDayPeriod() {
      const now = new Date();
      setDayPeriod(dayPeriodFor(now.getHours()));
      setTodayStamp(startOfDay(now.getTime()));
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
      else {
        available = [...available, ...vibeBehaviors[identity.vibe]];
        if (memory.needs.joy > 78) available = [...available, "happy", "happy", "spin"];
      }
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
  }, [behavior, identity.vibe, isPressed, memory.needs.energy, memory.needs.fullness, memory.needs.joy, memory.sleeping]);

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
    setArmedFood(null);
    setMessage("Nium… good night.");
    playCue("sleep");
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
    playCue("wake");
  }

  function toggleLamp() {
    setMemory((current) => ({
      ...current,
      lampOn: !current.lampOn,
      lastUpdated: new Date().toISOString(),
    }));
    playCue("blip");
  }

  function saveIdentity(next: PetIdentity) {
    const isFirstMeeting = !identity.onboarded;
    setMemory((current) => ({
      ...current,
      identity: next,
      lastUpdated: new Date().toISOString(),
    }));
    setIsEditingIdentity(false);
    setBehavior("happy");
    setMessage(isFirstMeeting ? vibes[next.vibe].greeting : `Still me — just ${next.name}!`);
    pushToast(isFirstMeeting ? `Say hello to ${next.name}` : "Profile saved", vibes[next.vibe].symbol);
    burstSparks("✦");
  }

  function remember(gesture: Gesture, bondGain: number) {
    const now = new Date();
    if (isFirstCareToday(memory.lastVisit, now.getTime())) {
      pushToast(`First moment with ${identity.name} today`, "☀");
    }
    setMemory((current) => ({
      ...current,
      bond: Math.min(100, current.bond + bondGain),
      interactions: {
        ...current.interactions,
        [gesture]: current.interactions[gesture] + 1,
      },
      needs: { ...current.needs, joy: Math.min(100, current.needs.joy + (gesture === "pet" ? 5 : 2)) },
      lastVisit: now.toISOString(),
      lastUpdated: now.toISOString(),
    }));
    burstSparks(gestureSparks[gesture]);
    pulseBond();
  }

  function feed(food: FoodId) {
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
    setArmedFood(null);
    setBehavior("happy");
    setLook({ x: 0, y: 0 });
    setMessage(`Nium! ${meal.name} is delicious!`);
    burstSparks("✧");
    playCue("eat");
  }

  function beginTouch(event: PointerEvent<HTMLButtonElement>) {
    if (memory.sleeping) {
      wakeUp();
      return;
    }
    if (armedFood) {
      feed(armedFood);
      return;
    }
    capturePointer(event);
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
      playCue("pet");
    } else if (duration >= 650) {
      remember("hold", 7);
      setMessage("Can we stay like this?");
      playCue("hold");
    } else {
      remember("tap", 4);
      setMessage(tapReactions[Math.floor(Math.random() * tapReactions.length)]);
      playCue("tap");
    }
    pointer.current = null;
  }

  /** Keyboard activation of the pet: Enter and Space report no pointer detail. */
  function activatePet(event: MouseEvent<HTMLButtonElement>) {
    if (event.detail !== 0) return;
    if (memory.sleeping) {
      wakeUp();
      return;
    }
    if (armedFood) {
      feed(armedFood);
      return;
    }
    remember("tap", 4);
    setMessage(tapReactions[Math.floor(Math.random() * tapReactions.length)]);
    playCue("tap");
  }

  function touchLeaf() {
    if (memory.sleeping) {
      wakeUp();
      return;
    }
    if (armedFood) {
      feed(armedFood);
      return;
    }
    remember("leaf", 5);
    setMessage("Ting! My leaf can feel you!");
    playCue("leaf");
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
    if (memory.sleeping) return;
    capturePointer(event);
    draggingFoodRef.current = food;
    foodPointer.current = { x: event.clientX, y: event.clientY, moved: false };
    setDraggingFood({ food, x: event.clientX, y: event.clientY });
    setBehavior("curious");
    setMessage(`Is that a ${foods[food].name.toLowerCase()}?`);
  }

  function moveFoodDrag(event: PointerEvent<HTMLButtonElement>) {
    const food = draggingFoodRef.current;
    if (!food || !foodPointer.current) return;
    const travelled = Math.hypot(
      event.clientX - foodPointer.current.x,
      event.clientY - foodPointer.current.y,
    );
    if (travelled > DRAG_SLOP) foodPointer.current.moved = true;
    setDraggingFood({ food, x: event.clientX, y: event.clientY });
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
    const moved = foodPointer.current?.moved ?? false;
    draggingFoodRef.current = null;
    foodPointer.current = null;
    setDraggingFood(null);
    if (!food) return;

    const rig = roomRef.current?.querySelector(".rig-root")?.getBoundingClientRect();
    const wasFed = Boolean(
      rig && event.clientX >= rig.left && event.clientX <= rig.right && event.clientY >= rig.top && event.clientY <= rig.bottom,
    );

    if (wasFed) {
      skipFoodClick.current = true;
      feed(food);
      return;
    }

    setBehavior("idle");
    setLook({ x: 0, y: 0 });
    if (moved) {
      skipFoodClick.current = true;
      setMessage("Almost! Bring it closer to me.");
    }
    // A treat that never moved is a tap — the click handler picks it up.
  }

  /** Tap or keyboard: arm a treat so it can be given by touching Niumpi. */
  function selectFood(food: FoodId) {
    if (skipFoodClick.current) {
      skipFoodClick.current = false;
      return;
    }
    if (memory.sleeping) return;
    const next = armedFood === food ? null : food;
    setArmedFood(next);
    setBehavior("curious");
    setMessage(
      next
        ? `Tap me to share the ${foods[next].name.toLowerCase()}!`
        : "Nium? Changed your mind?",
    );
    playCue("blip");
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
  const growthStage = growthStageFor(carePoints);
  const growth = growthProgressFor(carePoints, growthStage);
  const relationship = relationshipFor(memory.bond, totalInteractions);
  const showOnboarding = isLoaded && (!identity.onboarded || isEditingIdentity);

  useEffect(() => {
    if (!isLoaded) return;
    const previous = milestone.current;
    milestone.current = { stage: growthStage, style: careStyle, bond: relationship.key };
    if (!previous) return;
    if (growthStage > previous.stage) {
      pushToast(`${identity.name} grew — ${growthNames[growthStage]}`, "✦");
      playCue("chime");
    } else if (relationship.key !== previous.bond) {
      pushToast(relationship.name, relationship.symbol);
      playCue("chime");
    } else if (careStyle !== previous.style) {
      pushToast(careStyleDetails[careStyle].name, careStyleDetails[careStyle].symbol);
      playCue("chime");
    }
  }, [careStyle, growthStage, identity.name, isLoaded, playCue, pushToast, relationship]);

  return (
    <main className="page">
      <div className="app-frame">
        <GameHeader
          soundEnabled={soundEnabled}
          onToggleSound={() => setSoundEnabled((enabled) => !enabled)}
          bond={memory.bond}
          bondLevel={relationship.level}
          bondName={relationship.name}
          bondPulse={bondPulse}
        />

        <section
          ref={roomRef}
          className={`stage stage-${dayPeriod} ${memory.lampOn ? "lamp-on" : ""} ${memory.sleeping ? "is-sleeping" : ""}`}
          aria-label={`${identity.name}'s room`}
          onPointerMove={followPointer}
        >
          <RoomWindow dayPeriod={dayPeriod} />

          <div className="stage-grid">
            <div className="stage-left">
              <SpeechBubble message={message} />
            </div>

            <div className="stage-center">
              <div className="pet-stage">
                <span className="sleep-nest" aria-hidden="true" />
                <span className="pet-shadow" aria-hidden="true" />
                <RiggedNiumpi
                  behavior={behavior}
                  growthStage={growthStage}
                  careStyle={careStyle}
                  petName={identity.name}
                  isPressed={isPressed}
                  isTarget={Boolean(armedFood || draggingFood)}
                  position={position}
                  look={look}
                  onLeafTouch={touchLeaf}
                  onActivate={activatePet}
                  onPointerDown={beginTouch}
                  onPointerMove={moveTouch}
                  onPointerUp={endTouch}
                />
                <div className="spark-layer" style={{ "--pet-x": `${position.x}px` } as CSSProperties} aria-hidden="true">
                  {sparks.map((spark) => (
                    <span
                      className="love-spark"
                      key={spark.id}
                      style={{ "--spark-x": `${spark.offset}px`, "--spark-delay": `${spark.delay}ms` } as CSSProperties}
                    >
                      {spark.symbol}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="stage-right">
              <StatsCard needs={memory.needs} petName={identity.name} />
            </div>
          </div>
        </section>

        <BuddyCard
          identity={identity}
          relationship={relationship}
          lastCare={lastCareLabel(memory.lastVisit, todayStamp)}
          sharedMoments={totalInteractions}
          favorite={totalInteractions ? gestureLabels[favorite[0]] : null}
          onEdit={() => {
            playCue("blip");
            setIsEditingIdentity(true);
          }}
        />

        <GrowthCard
          stage={growthStage}
          stageName={growthNames[growthStage]}
          percent={growth.percent}
          remaining={growth.remaining}
        />

        <PersonalityBanner
          careStyle={careStyle}
          title={careStyleDetails[careStyle].name}
          note={careStyleDetails[careStyle].note}
        />

        <p className="interaction-hint">Tap, hold, pet, or touch the leaf</p>

        <SnackBar
          petName={identity.name}
          counts={memory.foods}
          disabled={memory.sleeping}
          selected={armedFood}
          dragging={draggingFood?.food ?? null}
          onDragStart={beginFoodDrag}
          onDragMove={moveFoodDrag}
          onDragEnd={endFoodDrag}
          onActivate={selectFood}
        />

        <ActionBar
          lampOn={memory.lampOn}
          sleeping={memory.sleeping}
          onToggleLamp={toggleLamp}
          onToggleSleep={memory.sleeping ? wakeUp : startSleep}
        />
      </div>

      {draggingFood && (
        <span
          className={`food-follower snack-icon food-${draggingFood.food}`}
          style={{ "--food-x": `${draggingFood.x}px`, "--food-y": `${draggingFood.y}px` } as CSSProperties}
          aria-hidden="true"
        />
      )}

      <Toasts toasts={toasts} />

      {showOnboarding && (
        <Onboarding
          mode={identity.onboarded ? "edit" : "create"}
          returning={totalInteractions + totalMeals > 0}
          identity={identity}
          onSave={saveIdentity}
          onCancel={() => setIsEditingIdentity(false)}
          onCue={(kind) => playCue(kind === "done" ? "chime" : "blip")}
        />
      )}
    </main>
  );
}
