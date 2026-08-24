"use client";

import { useState } from "react";
import { Art } from "../ui/Art";
import { Modal, Panel } from "../ui/parts";
import { useGame } from "../ui/GameProvider";
import { SOCIAL_BACKEND, canGift, markVisited, sendGift } from "../game/friends";
import { routeMap } from "../game/config/routes";
import { NiumpiBody } from "../ui/niumpi/NiumpiBody";
import { profileFor } from "../game/config/growth";
import { recordCare } from "../game/care";
import { progressMissions } from "../game/missions";
import { addSignal } from "../game/care";
import { awardMemory } from "../game/memories";
import { copy } from "../game/config/copy";

const statusCopy: Record<string, string> = {
  online: "Online", dreaming: "In a dream", playing: "Playing", exploring: "Exploring", away: "Away",
};

/** A stable stage per neighbour, so the street is not all the same age. */
function friendStage(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 997;
  return 2 + (hash % 4);
}

export function FriendsScene() {
  const { state, update, now, cue, toast, clock} = useGame();
  const [visiting, setVisiting] = useState<string | null>(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  function visit(friendId: string) {
    const care = recordCare(markVisited(state, friendId, clock()), "visit", clock(), { social: 3 });
    let settled = addSignal(care.state, "social");
    settled = progressMissions(settled, "visit", clock());
    settled = awardMemory(settled, "first-visitor", clock()).state;
    update(settled);
    cue("chime");
    setVisiting(friendId);
  }

  const friend = visiting ? state.friends.find((entry) => entry.id === visiting) : null;

  return (
    <div className="scene scene-friends">
      <header className="scene-head">
        <div>
          <h1>{copy.home.friends}</h1>
          <p>{copy.home.friendsNote}</p>
        </div>
        <button className="ghost-button" type="button" onClick={() => setPrivacyOpen(true)}>
          <Art name="lock" size={16} /> Privacy
        </button>
      </header>

      {!SOCIAL_BACKEND && (
        <p className="notice">
          These neighbours live on this device only — there is no social server yet, so nothing you do here
          leaves your browser. The service layer is in place for when one exists.
        </p>
      )}

      <ul className="friend-list">
        {state.friends.map((entry) => {
          const route = routeMap[entry.route];
          const giftable = canGift(entry, now) && state.inventory.currencies.dewdrops >= 5;
          return (
            <li key={entry.id} className="friend-card">
              {/* A real Niumpi in the neighbour's own route palette. This was
                  one flat glyph recoloured three times, so every neighbour was
                  the same creature — the thing that makes a world feel
                  inhabited is that the others are recognisably different. */}
              <span className={`friend-avatar body-${entry.route} morph-${entry.route}`} aria-hidden="true">
                <NiumpiBody profile={profileFor(friendStage(entry.id))} morphology={entry.route} />
              </span>
              <div className="friend-copy">
                <strong>{entry.name}</strong>
                <small>{route.name} · <span className={`friend-status status-${entry.status}`}>{statusCopy[entry.status]}</span></small>
              </div>
              <div className="friend-tools">
                <button className="ghost-button" type="button" onClick={() => visit(entry.id)}>Visit room</button>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={!giftable}
                  onClick={() => {
                    const next = sendGift(state, entry.id, clock());
                    if (next) { update(next); cue("reward"); toast(`Gift sent to ${entry.name}`, "♡"); }
                    else toast("Not yet — one gift per day each", "✕");
                  }}
                >
                  Send gift
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {friend && (
        <Modal title={`${friend.name}'s room`} onClose={() => setVisiting(null)} wide>
          <div className="visit-room" style={{ "--route-colour": routeMap[friend.route].palette.body } as React.CSSProperties}>
            <span className="preview-window" />
            <span className="preview-floor" />
            <span className="visit-pet"><Art name="niumpi" size={72} /></span>
            <span className="visit-piece"><Art name="cushion" size={40} /></span>
            <span className="visit-piece is-two"><Art name="pot" size={36} /></span>
          </div>
          <div className="visit-reactions">
            {["♡", "✦", "☾", "♪"].map((emoji) => (
              <button key={emoji} className="emoji-button" type="button"
                onClick={() => { cue("blip"); toast(`You reacted ${emoji}`, emoji); }}>
                {emoji}
              </button>
            ))}
          </div>
          <p className="soft-note">
            Public achievements only. Your Memory Seed answers are never shared.
          </p>
        </Modal>
      )}

      {privacyOpen && (
        <Modal title="Privacy" onClose={() => setPrivacyOpen(false)}>
          <Panel tone="pastel">
            <label className="switch-row">
              <input
                type="checkbox"
                checked={state.profile.settings.shareProfile}
                onChange={(event) => update({
                  ...state,
                  profile: { ...state.profile, settings: { ...state.profile.settings, shareProfile: event.target.checked } },
                })}
              />
              <span>Let neighbours see my Niumpi’s name and stage</span>
            </label>
          </Panel>
          <ul className="privacy-list">
            <li>Memory Seed answers are never shared, with anyone.</li>
            <li>Gifts are limited to one per neighbour per day.</li>
            <li>There is no open chat — only fixed reactions.</li>
            <li>You can block or report a neighbour from their room.</li>
          </ul>
          <div className="privacy-actions">
            <button className="ghost-button" type="button" onClick={() => toast("Neighbour blocked", "✕")}>Block</button>
            <button className="ghost-button" type="button" onClick={() => toast("Report sent", "✓")}>Report</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
