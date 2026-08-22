"use client";

import { useEffect, useState } from "react";
import { MotionConfig } from "motion/react";
import { CosmicBackground } from "./CosmicBackground";
import { DesktopSidebar, MobileNav } from "./Navigation";
import { SceneRouter } from "./SceneRouter";
import { RewardLayer, ToastLayer } from "./RewardLayer";
import { SettingsDialog } from "./SettingsDialog";
import { DevPanel } from "./DevPanel";
import { Art } from "./Art";
import { useGame } from "./GameProvider";
import { copy } from "../game/config/copy";

/**
 * The persistent frame. Nothing in here unmounts when the scene changes, so
 * navigation never reloads the page, never resets the sidebar and never loses
 * the animation controller's state.
 */
/**
 * Local saves finish in a millisecond, so a "Saving…" pill on every write is
 * pure noise sitting on top of the game. It only appears if a write is actually
 * taking long enough for someone to wonder.
 */
const SLOW_SAVE_MS = 600;

function useSlowSave(status: string): boolean {
  const [slowSince, setSlowSince] = useState<string | null>(null);
  useEffect(() => {
    if (status !== "saving") return;
    const timer = window.setTimeout(() => setSlowSince("saving"), SLOW_SAVE_MS);
    return () => window.clearTimeout(timer);
  }, [status]);
  return status === "saving" && slowSince === "saving";
}

export function GameShell() {
  const { state, saveStatus, online, devMode, ready } = useGame();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const slowSave = useSlowSave(saveStatus);
  // Until the save is read, show the full frame: the common case is a
  // returning player, and the chrome is identical on the server and client.
  const chrome = ready ? Boolean(state.niumpi.hatchedAt) : true;

  // The player's Motion setting drives Framer Motion as well as the character
  // controller, so one choice governs every animation in the app.
  const reducedMotion =
    state.profile.settings.reducedMotion === "on" ? "always"
    : state.profile.settings.reducedMotion === "off" ? "never"
    : "user";

  return (
    <MotionConfig reducedMotion={reducedMotion}>
      <div className={`shell ${chrome ? "" : "is-onboarding"}`}>
        <CosmicBackground />

        {chrome && <DesktopSidebar />}

        <div className="shell-body">
          <SceneRouter />
        </div>

        {chrome && <MobileNav />}

        <div className="shell-status" aria-live="polite">
          {!online && <span className="status-pill is-offline">{copy.states.offline}</span>}
          {slowSave && <span className="status-pill">{copy.states.saving}</span>}
          {saveStatus === "error" && <span className="status-pill is-error">{copy.states.saveFailed}</span>}
        </div>

        {chrome && (
          <button
            className="settings-button"
            type="button"
            aria-label={copy.nav.settings}
            onClick={() => setSettingsOpen(true)}
          >
            <Art name="gear" size={18} />
          </button>
        )}

        <ToastLayer />
        <RewardLayer />
        {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
        {devMode && <DevPanel />}
      </div>
    </MotionConfig>
  );
}
