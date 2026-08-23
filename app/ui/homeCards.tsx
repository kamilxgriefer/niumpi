"use client";

import { useMemo, useState } from "react";
import { Art } from "./Art";
import { RoutePortrait } from "./RoutePortrait";
import { Chip, EmptyState, Meter, Panel, TabBar } from "./parts";
import { useGame } from "./GameProvider";
import { copy } from "../game/config/copy";
import { seedQuestions } from "../game/config/seeds";
import { traitMap, traits } from "../game/config/traits";
import { routeMap, routes } from "../game/config/routes";
import { itemMap } from "../game/config/items";
import { missionMap } from "../game/config/missions";
import { stageMap } from "../game/config/stages";
import { answerSeed } from "../game/actions";
import { claimMission } from "../game/missions";
import { discoveryLine } from "../game/reactions";
import { routeOutlook } from "../game/evolution";
import { stageProgress } from "../game/care";
import { vibeChips } from "../game/mood";
import { hashSeed, makeRng } from "../game/rng";
import { dayKeyFor } from "../game/time";
import { relationshipFor } from "../identity";

/* -------------------------------------------------------- memory seeds ---- */

export function MemorySeedCard() {
  const { state, run, now, isOpen, goTo, clock} = useGame();
  const unlock = isOpen("memory");

  /** One question per day, chosen deterministically and never repeated. */
  const question = useMemo(() => {
    const unanswered = seedQuestions.filter((entry) => !state.seedAnswers[entry.id]);
    if (!unanswered.length) return null;
    const rng = makeRng(hashSeed(state.profile.id, dayKeyFor(now), "seed"));
    return unanswered[Math.floor(rng() * unanswered.length)];
  }, [now, state.profile.id, state.seedAnswers]);

  if (!state.profile.settings.seedQuestions) return null;

  return (
    <Panel title={copy.home.memorySeeds} note={copy.home.memorySeedsNote} art="leaf" className="card-seeds">
      {!unlock.open ? (
        <p className="soft-note">{unlock.note}</p>
      ) : question ? (
        <div className="seed-question">
          <p className="seed-prompt">{question.prompt}</p>
          <div className="seed-options">
            {question.options.map((option, index) => (
              <button
                key={option.label}
                className="seed-option"
                type="button"
                onClick={() => run(answerSeed(state, question.id, index as 0 | 1, clock()))}
              >
                <span className={`seed-art seed-art-${option.art}`}>
                  <Art name={option.art} size={34} />
                </span>
                <span className="seed-label">{option.label}</span>
              </button>
            ))}
          </div>
          <p className="seed-privacy">{copy.safety.seedPrivacy}</p>
        </div>
      ) : (
        <EmptyState art="check" title="You've answered them all" note="Niumpi will think of new ones."
          action={<button className="ghost-button" type="button" onClick={() => goTo("memory")}>Review answers</button>} />
      )}
    </Panel>
  );
}

/* --------------------------------------------------------- personality ---- */

export function PersonalityPanel() {
  const { state, say, cue } = useGame();
  const [tab, setTab] = useState("traits");
  const known = Object.keys(state.personality.traits);
  const preferences = Object.entries(state.seedAnswers);

  return (
    <Panel title={copy.home.personality} art="personality" className="card-personality">
      <TabBar
        label="Personality"
        active={tab}
        onSelect={setTab}
        tabs={[{ id: "traits", label: copy.home.traits }, { id: "prefs", label: copy.home.preferences }]}
      />
      {tab === "traits" ? (
        <>
          <p className="panel-count">Discovered traits {known.length}/{traits.length}</p>
          <ul className="trait-list">
            {traits.slice(0, 8).map((trait) => {
              const found = Boolean(state.personality.traits[trait.id]);
              return (
                <li key={trait.id}>
                  <button
                    className={`trait-chip ${found ? "is-found" : "is-hidden"}`}
                    type="button"
                    disabled={!found}
                    onClick={() => { cue("blip"); say(`${trait.name} — ${trait.how}.`); }}
                  >
                    <span className="trait-symbol" aria-hidden="true">{found ? trait.symbol : "?"}</span>
                    {found ? trait.name : "???"}
                  </button>
                </li>
              );
            })}
          </ul>
          {known.length > 0 && (
            <p className="trait-note">
              {traitMap[known[known.length - 1]].name}: {traitMap[known[known.length - 1]].note}
            </p>
          )}
        </>
      ) : (
        <ul className="pref-list">
          {preferences.length === 0 && <li className="soft-note">Answer a Memory Seed to start this list.</li>}
          {preferences.slice(0, 6).map(([id, answer]) => {
            const question = seedQuestions.find((entry) => entry.id === id);
            if (!question) return null;
            return (
              <li key={id} className="pref-row">
                <Art name={question.options[answer.choice].art} size={16} />
                <span>{question.options[answer.choice].label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ----------------------------------------------------------- discovery ---- */

/* ---------------------------------------------------------- status strip ----
 *
 * Growth, shared moments, the latest discovery and today's vibe used to be four
 * full-width cards stacked between the creature and the controls you use on it
 * — 515px of reading measured on a real viewport, sitting between looking at
 * your pet and doing something with it. They are all readouts that link
 * somewhere else, not actions on the creature, so they belong after the care
 * loop rather than inside it. Same information, one compact strip.
 */

export function PetStatusStrip() {
  const { state, now, goTo } = useGame();
  const progress = stageProgress(state, now);
  const moments = state.memories.length;
  const relationship = relationshipFor(state.niumpi.bond, moments);
  const discovery = discoveryLine(state);
  const chips = vibeChips(state, now);

  return (
    <section className="status-strip" aria-label="How Niumpi is doing">
      <div className="status-vibe">
        <span className="status-vibe-label">{copy.home.vibe}</span>
        <div className="status-vibe-chips">
          {chips.map((chip) => <Chip key={chip.id} label={chip.label} art={chip.art} />)}
        </div>
      </div>

      <div className="status-tiles">
        <button className="status-tile tile-growth" type="button" onClick={() => goTo("evolution")}>
          <span className="status-kicker">Stage {progress.stage}</span>
          <strong className="status-title">{progress.name}</strong>
          <span className="status-meter" aria-hidden="true">
            <i style={{ width: `${progress.percent}%` }} />
          </span>
          <small className="status-note">
            {progress.careTarget
              ? `${progress.careMoments} / ${progress.careTarget} care moments`
              : "Fully grown together"}
          </small>
        </button>

        <button className="status-tile tile-moments" type="button" onClick={() => goTo("memory")}>
          <span className="status-icon"><Art name="star" size={20} /></span>
          <strong className="status-title">{moments} {copy.home.sharedMoments}</strong>
          <small className="status-note">
            {moments ? copy.home.sharedMomentsNote : "Your story starts here"}
          </small>
        </button>

        <button className="status-tile tile-bond" type="button" onClick={() => goTo("evolution")}>
          <span className="status-icon"><Art name="bond" size={20} /></span>
          <strong className="status-title">{relationship.name}</strong>
          <small className="status-note">Bond is growing</small>
        </button>

        <button className="status-tile tile-discovery" type="button" onClick={() => goTo("memory")}>
          <span className="status-icon"><Art name="leaf" size={20} /></span>
          <strong className="status-title">
            {discovery ? discovery.title : copy.home.discoveryEmpty}
          </strong>
          <small className="status-note">
            {discovery ? discovery.note : copy.home.discoveryEmptyNote}
          </small>
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------ evolution card ---- */

export function EvolutionPreview() {
  const { state, goTo, isOpen } = useGame();
  const unlock = isOpen("evolution");
  const outlook = routeOutlook(state);
  return (
    <Panel
      title={copy.home.evolution} note={copy.home.evolutionNote} art="evolution"
      className="card-evolution" onOpen={unlock.open ? () => goTo("evolution") : undefined}
    >
      <ol className="evo-line">
        {[0, 1, 2, 3].map((stage) => (
          <li key={stage} className={state.niumpi.stage >= stage ? "is-done" : ""}>
            <Art name={stageMap[stage].art} size={22} />
            <span>{stageMap[stage].name}</span>
          </li>
        ))}
      </ol>
      <ul className="evo-routes">
        {routes.map((route) => {
          const locked = state.evolution.lockedRoute === route.id;
          return (
            <li key={route.id} className={`evo-route route-${route.id} ${locked ? "is-locked-in" : ""}`}>
              <RoutePortrait id={route.id} size={40} />
              <strong>{route.name}</strong>
              <small>{route.tagline}</small>
            </li>
          );
        })}
      </ul>
      {unlock.open ? (
        <p className="evo-hint">{outlook.hint}</p>
      ) : (
        <p className="soft-note">{unlock.note}</p>
      )}
    </Panel>
  );
}

/* ----------------------------------------------------------- room card ---- */

export function RoomPreview() {
  const { state, goTo, isOpen } = useGame();
  const unlock = isOpen("room");
  const owned = state.inventory.items.slice(0, 4);
  return (
    <Panel
      title={copy.home.room} note={copy.home.roomNote} art="room"
      className="card-room" onOpen={unlock.open ? () => goTo("room") : undefined}
    >
      <div className="room-preview" aria-hidden="true">
        <span className="preview-window" />
        <span className="preview-floor" />
        {state.room.placed.slice(0, 4).map((placed) => (
          <span
            key={placed.uid}
            className="preview-item"
            style={{ left: `${8 + placed.x * 11}%`, bottom: `${8 + placed.y * 9}%` }}
          >
            <Art name={itemMap[placed.itemId]?.art ?? "cushion"} size={26} />
          </span>
        ))}
      </div>
      <ul className="room-chips">
        {owned.map((id) => (
          <li key={id}><Chip label={itemMap[id]?.name ?? id} art={itemMap[id]?.art} /></li>
        ))}
      </ul>
      {!unlock.open && <p className="soft-note">{unlock.note}</p>}
    </Panel>
  );
}

/* ------------------------------------------------------------ missions ---- */

export function MissionsCard() {
  const { state, update, showReward, cue, clock } = useGame();
  return (
    <Panel title={copy.home.missions} art="check" className="card-missions">
      <ul className="mission-list">
        {state.missions.daily.map((entry) => {
          const template = missionMap[entry.id];
          if (!template) return null;
          const done = entry.progress >= template.target;
          return (
            <li key={entry.id} className={`mission ${done ? "is-done" : ""} ${entry.claimed ? "is-claimed" : ""}`}>
              <div className="mission-copy">
                <strong>{template.label}</strong>
                <small>{template.note}</small>
              </div>
              <Meter label={`${Math.min(entry.progress, template.target)}/${template.target}`}
                value={Math.min(entry.progress, template.target)} max={template.target} />
              {done && !entry.claimed && (
                <button
                  className="mission-claim"
                  type="button"
                  onClick={() => {
                    const result = claimMission(state, entry.id, clock());
                    if (result.rewards.length) {
                      update(result.state);
                      cue("reward");
                      showReward(template.label, result.rewards, "Mission complete");
                    }
                  }}
                >
                  Claim
                </button>
              )}
              {entry.claimed && <span className="mission-done"><Art name="check" size={16} /></span>}
            </li>
          );
        })}
      </ul>
      <p className="mission-weekly">
        Complete activities on 5 of 7 days — {state.missions.weekly.days.length}/5 so far.
        {" "}Missing a day costs nothing.
      </p>
    </Panel>
  );
}

/* ---------------------------------------------------------- activities ---- */

export function ActivityTiles() {
  const { goTo, isOpen } = useGame();
  const tiles = [
    { id: "games" as const, title: copy.home.miniGames, note: copy.home.miniGamesNote, art: "game" },
    { id: "cooking" as const, title: copy.home.cooking, note: copy.home.cookingNote, art: "cook" },
    { id: "dreams" as const, title: copy.home.dreamDoors, note: copy.home.dreamDoorsNote, art: "dream" },
    { id: "friends" as const, title: copy.home.friends, note: copy.home.friendsNote, art: "friends" },
  ];
  return (
    <ul className="activity-grid">
      {tiles.map((tile) => {
        const unlock = isOpen(tile.id);
        return (
          <li key={tile.id}>
            <button
              className={`activity-tile tile-${tile.id} ${unlock.open ? "" : "is-locked"}`}
              type="button"
              aria-disabled={!unlock.open}
              onClick={() => unlock.open && goTo(tile.id)}
            >
              <span className="activity-art"><Art name={unlock.open ? tile.art : "lock"} size={30} /></span>
              <strong>{tile.title}</strong>
              <small>{unlock.open ? tile.note : unlock.note}</small>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export { routeMap };
