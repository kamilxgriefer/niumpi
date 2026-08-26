"use client";

import { Modal } from "./parts";
import { useGame } from "./GameProvider";
import { copy } from "../game/config/copy";
import type { Settings } from "../game/types";

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { state, update, toast, cue } = useGame();
  const settings = state.profile.settings;

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    update({ ...state, profile: { ...state.profile, settings: { ...settings, [key]: value } } });
  }

  return (
    <Modal title={copy.nav.settings} onClose={onClose}>
      <fieldset className="settings-group">
        <legend>Sound</legend>
        <label className="switch-row">
          <input type="checkbox" checked={settings.sound} onChange={(event) => {
            set("sound", event.target.checked);
            if (event.target.checked) cue("chime", { force: true, source: "ui" });
          }} />
          <span>All sound</span>
        </label>
        <label className="switch-row">
          <input type="checkbox" checked={settings.music} disabled={!settings.sound}
            onChange={(event) => set("music", event.target.checked)} />
          <span>Adaptive music &amp; ambience</span>
        </label>
        <label className="switch-row">
          <input type="checkbox" checked={settings.effects} disabled={!settings.sound}
            onChange={(event) => set("effects", event.target.checked)} />
          <span>Niumpi reactions &amp; interface</span>
        </label>
      </fieldset>

      <fieldset className="settings-group">
        <legend>Motion</legend>
        <div className="radio-row" role="radiogroup" aria-label="Reduced motion">
          {(["system", "on", "off"] as const).map((value) => (
            <button
              key={value}
              className={`carry-chip ${settings.reducedMotion === value ? "is-active" : ""}`}
              type="button"
              role="radio"
              aria-checked={settings.reducedMotion === value}
              onClick={() => set("reducedMotion", value)}
            >
              <strong>{value === "system" ? "Match my device" : value === "on" ? "Reduce motion" : "Full motion"}</strong>
            </button>
          ))}
        </div>
        <label className="switch-row">
          <input type="checkbox" checked={settings.lowPower} onChange={(event) => set("lowPower", event.target.checked)} />
          <span>Simplified effects (better on older phones)</span>
        </label>
      </fieldset>

      <fieldset className="settings-group">
        <legend>Privacy</legend>
        <label className="switch-row">
          <input type="checkbox" checked={settings.seedQuestions} onChange={(event) => set("seedQuestions", event.target.checked)} />
          <span>Ask me Memory Seed questions</span>
        </label>
        <p className="soft-note">{copy.safety.seedPrivacy}</p>
      </fieldset>

      <fieldset className="settings-group">
        <legend>Your data</legend>
        <p className="soft-note">Everything is stored on this device. Nothing is uploaded.</p>
        <button
          className="ghost-button"
          type="button"
          onClick={() => {
            const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `niumpi-save-${new Date().toISOString().slice(0, 10)}.json`;
            link.click();
            URL.revokeObjectURL(url);
            toast("Save exported", "✓");
          }}
        >
          Export my save
        </button>
      </fieldset>
    </Modal>
  );
}
