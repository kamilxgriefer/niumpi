"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import type { CareActionId, GameState, Reward, SceneId } from "../game/types";
import { applyElapsed, tick } from "../game/stats";
import { loadGame, localAdapter, pruneClaims } from "../game/persistence";
import { createGameState, makeId } from "../game/state";
import type { SaveStatus } from "../game/persistence";
import { rollMissions } from "../game/missions";
import { settleUnlocks, sceneUnlock } from "../game/unlocks";
import { ensureFriends } from "../game/friends";
import { recordWeatherDay, reunion } from "../game/actions";
import type { ActionResult } from "../game/actions";
import { chooseLine, rememberLine } from "../game/reactions";
import { setTimeMultiplier } from "../game/time";
import { playCue } from "./audio";
import type { CueName } from "./audio";
import { NiumpiAnimationController } from "../anim/NiumpiAnimationController";
import type { AnimState } from "../anim/NiumpiAnimationController";
import { setMotionPreference } from "../anim/motionPrefs";
import { publishLiveGameState, runtimeHeartbeatEnabled, runtimeNow } from "../game/runtimeClock.ts";

export type Toast = { id: number; text: string; icon: string };
export type RewardCard = { id: number; title: string; rewards: Reward[]; source: string } | null;

type GameContextValue = {
  state: GameState;
  ready: boolean;
  now: number;
  saveStatus: SaveStatus;
  online: boolean;
  scene: SceneId;
  message: string;
  /** Owns every per-frame animation value; React never sees a frame. */
  controller: NiumpiAnimationController;
  goTo: (scene: SceneId) => void;
  /** Runs a rule from `game/actions`, then plays its feedback. */
  run: <T extends ActionResult>(result: T, source?: string) => T;
  update: (next: GameState) => void;
  /** Functional update, so back-to-back changes cannot clobber each other. */
  patch: (change: (current: GameState) => GameState) => void;
  say: (message: string) => void;
  toast: (text: string, icon?: string) => void;
  showReward: (title: string, rewards: Reward[], source?: string) => void;
  toasts: Toast[];
  reward: RewardCard;
  dismissReward: () => void;
  cue: (name: CueName) => void;
  /** Reads wall-clock time. Stable, so calling it is never a render-time impurity. */
  clock: () => number;
  isOpen: (scene: SceneId) => { open: boolean; note: string };
  sparks: Array<{ id: number; symbol: string; offset: number; delay: number }>;
  devMode: boolean;
};

const GameContext = createContext<GameContextValue | null>(null);

export const scenes: SceneId[] = [
  "home", "niumpi", "room", "memory", "garden", "games", "shop",
  "journey", "evolution", "cooking", "dreams", "friends", "about", "seed",
];

function sceneFromUrl(): SceneId {
  if (typeof window === "undefined") return "home";
  const value = new URLSearchParams(window.location.search).get("scene");
  return scenes.includes(value as SceneId) ? (value as SceneId) : "home";
}

/**
 * Fixed epoch for the very first render. The server and the client both build
 * the same placeholder state from it, so the shell server-renders as real
 * markup and hydrates without a mismatch. The saved game replaces it in an
 * effect, which is the only place the injected/runtime wall clock is read.
 */
const SSR_EPOCH = 0;

const TICK_MS = 8_000;
const SAVE_DEBOUNCE_MS = 700;
const TOAST_LIFE = 3_200;
const SPARK_LIFE = 1_500;

/** Network status read the way React wants an external source read. */
function subscribeOnline(notify: () => void) {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}

export function GameProvider({ children }: { children: ReactNode }) {
  const adapter = useMemo(() => localAdapter(), []);
  const [state, setState] = useState<GameState>(() => createGameState(SSR_EPOCH, "pending"));
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(SSR_EPOCH);
  const [scene, setScene] = useState<SceneId>("home");
  const [message, setMessage] = useState("…");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [reward, setReward] = useState<RewardCard>(null);
  const [sparks, setSparks] = useState<GameContextValue["sparks"]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [devMode, setDevMode] = useState(false);
  const counter = useRef(0);
  const timers = useRef<number[]>([]);
  const saveTimer = useRef<number | undefined>(undefined);
  const latest = useRef<GameState | null>(null);
  const booted = useRef(false);
  // One controller for the whole session: scenes attach and detach, it persists.
  const [controller] = useState(() => new NiumpiAnimationController());

  useEffect(() => {
    latest.current = state;
    publishLiveGameState(state);
  }, [state]);

  const later = useCallback((run: () => void, delay: number) => {
    const timer = window.setTimeout(() => {
      timers.current = timers.current.filter((entry) => entry !== timer);
      run();
    }, delay);
    timers.current.push(timer);
  }, []);

  useEffect(() => () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    window.clearTimeout(saveTimer.current);
  }, []);

  const pushToast = useCallback((text: string, icon = "✦") => {
    counter.current += 1;
    const id = counter.current;
    setToasts((current) => [...current, { id, text, icon }].slice(-3));
    later(() => setToasts((current) => current.filter((entry) => entry.id !== id)), TOAST_LIFE);
  }, [later]);

  const burst = useCallback((symbol: string) => {
    const created = [0, 1, 2].map((index) => {
      counter.current += 1;
      return { id: counter.current, symbol, offset: Math.round(Math.random() * 84 - 42), delay: index * 110 };
    });
    setSparks((current) => [...current, ...created].slice(-12));
    const born = new Set(created.map((spark) => spark.id));
    later(() => setSparks((current) => current.filter((spark) => !born.has(spark.id))), SPARK_LIFE);
  }, [later]);

  const cue = useCallback((name: CueName) => {
    if (latest.current?.profile.settings.sound) playCue(name);
  }, []);

  const showReward = useCallback((title: string, rewards: Reward[], source = "") => {
    if (!rewards.length) return;
    counter.current += 1;
    setReward({ id: counter.current, title, rewards, source });
  }, []);

  /* ---------------- boot: load, migrate, catch up on elapsed time ---------- */
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const dev = process.env.NODE_ENV !== "production" && params.get("dev") === "1";
    if (dev) setTimeMultiplier(Number(params.get("speed")) || 1);

    async function boot() {
      const at = runtimeNow();
      setDevMode(dev);
      const loaded = await loadGame(adapter, at);
      if (cancelled) return;
      const { state: caught, report } = applyElapsed(loaded, at);
      let next = settleUnlocks(caught, at);
      next = ensureFriends(next, at);
      next = rollMissions(next, at, (id) => next.unlocks.includes(id));
      next = recordWeatherDay(next, at);

      if (report.longAbsence && next.niumpi.hatchedAt) {
        const welcome = reunion(next, at);
        next = welcome.state;
        if (welcome.message) setMessage(welcome.message);
        welcome.toasts.forEach((entry) => pushToast(entry.text, entry.icon));
      } else if (next.niumpi.hatchedAt) {
        const line = chooseLine(next, at);
        next = rememberLine(next, line.id);
        setMessage(line.text);
      } else {
        setMessage("…nium?");
      }

      booted.current = true;
      setState(next);
      setNow(at);
      controller.setRest(next.niumpi.sleeping ? "asleep" : "idle");
      setScene(next.niumpi.hatchedAt ? sceneFromUrl() : "seed");
    }

    boot()
      .catch((error) => {
        // A bad save must never strand anyone on the loading frame. Start the
        // session on a fresh state and say so, rather than hanging silently.
        console.error("[niumpi] could not restore the save", error);
        if (cancelled) return;
        booted.current = true;
        const at = runtimeNow();
        setState(createGameState(at, makeId(at)));
        setNow(at);
        setMessage("…nium?");
        setScene("seed");
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter]);

  /* ---------------- clock ------------------------------------------------- */
  useEffect(() => {
    if (!ready) return;
    const clock = window.setInterval(() => setNow(runtimeNow()), 1_000);
    return () => window.clearInterval(clock);
  }, [ready]);

  useEffect(() => {
    if (!ready || !runtimeHeartbeatEnabled()) return;
    const heartbeat = window.setInterval(() => {
      setState((current) => tick(current, TICK_MS / 1000));
    }, TICK_MS);
    return () => window.clearInterval(heartbeat);
  }, [ready]);

  /* ---------------- returning to the tab catches up properly -------------- */
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible" || !latest.current) return;
      const at = runtimeNow();
      const { state: caught } = applyElapsed(latest.current, at);
      setState(rollMissions(settleUnlocks(caught, at), at, (id) => caught.unlocks.includes(id)));
      setNow(at);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  /* ---------------- debounced save with a visible status ------------------ */
  useEffect(() => {
    // Never write the placeholder over a real save before it has been read.
    if (!ready || !booted.current) return;
    setSaveStatus("saving");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      adapter
        .save(pruneClaims({ ...state, profile: { ...state.profile, lastSeenAt: runtimeNow() } }))
        .then(() => setSaveStatus("saved"))
        .catch(() => {
          setSaveStatus("error");
          // One quiet retry — a failed write must never lose a session.
          window.setTimeout(() => {
            if (latest.current) adapter.save(latest.current).then(() => setSaveStatus("saved")).catch(() => {});
          }, 4_000);
        });
    }, SAVE_DEBOUNCE_MS);
  }, [state, adapter, ready]);

  /* ---------------- URL <-> scene ----------------------------------------- */
  useEffect(() => {
    function onPop() { setScene(sceneFromUrl()); }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const goTo = useCallback((next: SceneId) => {
    setScene(next);
    const url = next === "home" ? window.location.pathname : `${window.location.pathname}?scene=${next}`;
    window.history.pushState({ scene: next }, "", url);
  }, []);

  const run = useCallback(<T extends ActionResult>(result: T, source = "") => {
    setState(result.state);
    if (result.message) setMessage(result.message);
    if (result.prop) controller.setActionProp(result.prop);
    if (result.behavior) controller.request(result.behavior as AnimState);
    if (result.spark) burst(result.spark);
    if (result.sound) cue(result.sound as CueName);
    result.toasts.forEach((entry) => pushToast(entry.text, entry.icon));
    // Small payouts stay as toasts; a real haul gets a card, titled by the
    // most significant thing in it rather than a generic line.
    if (result.rewards.length >= 2 || result.rewards.some((r) => r.kind !== "currency")) {
      const headline = result.rewards.find((r) => r.kind === "route")
        ?? result.rewards.find((r) => r.kind === "stage")
        ?? result.rewards.find((r) => r.kind === "trait")
        ?? result.rewards.find((r) => r.kind === "recipe");
      const title =
        headline?.kind === "route" ? `A path opens — ${headline.name}`
        : headline?.kind === "stage" ? `Grew into ${headline.name}`
        : headline?.kind === "trait" ? `Something true — ${headline.name}`
        : headline?.kind === "recipe" ? "A new recipe"
        : source || "You found something";
      showReward(title, result.rewards, source || "Care");
    }
    return result;
  }, [burst, controller, cue, pushToast, showReward]);

  const update = useCallback((next: GameState) => setState(next), []);
  const patch = useCallback((change: (current: GameState) => GameState) => setState(change), []);

  const clock = useCallback(() => runtimeNow(), []);

  const isOpen = useCallback(
    (target: SceneId) => (ready ? sceneUnlock(state, target, now) : { open: true, note: "" }),
    [now, ready, state],
  );

  /* The player's motion preference feeds the controller and Framer Motion alike. */
  useEffect(() => {
    if (state) setMotionPreference(state.profile.settings.reducedMotion);
  }, [state?.profile.settings.reducedMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  const value: GameContextValue = {
    state, ready, now, saveStatus, online, scene, message, controller,
    goTo, run, update, patch, say: setMessage, toast: pushToast, showReward,
    toasts, reward, dismissReward: () => setReward(null), cue, clock, isOpen, sparks, devMode,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame(): GameContextValue {
  const value = useContext(GameContext);
  if (!value) throw new Error("useGame must be used inside GameProvider");
  return value;
}

export type { CareActionId };
