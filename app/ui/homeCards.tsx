"use client";

import { useMemo, useState } from "react";
import { Art } from "./Art";
import { Chip, EmptyState, Meter, Panel, TabBar } from "./parts";
import { useGame } from "./GameProvider";
import { copy } from "../game/config/copy";
import { seedQuestions } from "../game/config/seeds";
import { traitMap, traits } from "../game/config/traits";
import { routeMap } from "../game/config/routes";
import { missionMap, weeklyMissionMap } from "../game/config/missions";
import { answerSeed } from "../game/actions";
import { claimMission } from "../game/missions";
import { discoveryLine } from "../game/reactions";
import { stageProgress } from "../game/care";
import { vibeChips } from "../game/mood";
import { hashSeed, makeRng } from "../game/rng";
import { dayKeyFor } from "../game/time";

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

/* ----------------------------------------------------------- discovery ---- */

/* ---------------------------------------------------------- personality ----
 *
 * The full trait and preference list. It used to live on Home, which was the
 * only place it existed — so the compact preview there had to lead somewhere
 * real rather than replace it. It belongs beside the creature it describes.
 */

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

/* ------------------------------------------------------- system previews ----
 *
 * Home used to carry a full copy of Personality, Evolution Journey and Your
 * Room — 981px of a 3581px phone page, each one repeating a whole scene that
 * already has its own screen. A preview says what changed and offers a way in;
 * the scene itself is where the detail lives.
 */

type PreviewProps = {
  title: string;
  art: string;
  /** The one live fact worth knowing without opening the scene. */
  headline: string;
  note: string;
  cta: string;
  onOpen?: () => void;
  lockedNote?: string;
  children?: React.ReactNode;
};

function SystemPreview({ title, art, headline, note, cta, onOpen, lockedNote, children }: PreviewProps) {
  const body = (
    <>
      <span className="preview-art"><Art name={art} size={26} /></span>
      <span className="preview-copy">
        <span className="preview-title">{title}</span>
        <strong className="preview-headline">{headline}</strong>
        <small className="preview-note">{lockedNote ?? note}</small>
      </span>
      {children}
      {onOpen && <span className="preview-cta" aria-hidden="true">{cta}</span>}
    </>
  );

  if (!onOpen) return <div className="system-preview is-locked">{body}</div>;
  return (
    <button className="system-preview" type="button" onClick={onOpen}>
      {body}
    </button>
  );
}

export function PersonalityPreview() {
  const { state, goTo } = useGame();
  const known = Object.keys(state.personality.traits);
  const latest = known.length ? traitMap[known[known.length - 1]] : null;
  return (
    <SystemPreview
      title={copy.home.personality}
      art="personality"
      headline={latest ? latest.name : "Still a mystery"}
      note={`${known.length} of ${traits.length} traits discovered`}
      cta="Open"
      onOpen={() => goTo("niumpi")}
    />
  );
}

export function EvolutionPreviewCard() {
  const { state, now, goTo, isOpen } = useGame();
  const unlock = isOpen("evolution");
  const progress = stageProgress(state, now);
  return (
    <SystemPreview
      title={copy.home.evolution}
      art="evolution"
      headline={progress.name}
      note={
        progress.careTarget
          ? `${progress.careMoments} of ${progress.careTarget} care moments`
          : "Fully grown together"
      }
      cta="Open"
      onOpen={unlock.open ? () => goTo("evolution") : undefined}
      lockedNote={unlock.open ? undefined : unlock.note}
    >
      <span className="preview-meter" aria-hidden="true">
        <i style={{ width: `${progress.percent}%` }} />
      </span>
    </SystemPreview>
  );
}

export function RoomPreviewCard() {
  const { state, goTo, isOpen } = useGame();
  const unlock = isOpen("room");
  const placed = state.room.placed.length;
  return (
    <SystemPreview
      title={copy.home.room}
      art="room"
      headline={placed ? `${placed} things placed` : "An empty corner"}
      note={copy.home.roomNote}
      cta="Open"
      onOpen={unlock.open ? () => goTo("room") : undefined}
      lockedNote={unlock.open ? undefined : unlock.note}
    />
  );
}

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
  const moments = state.memories.length;
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
        <button className="status-tile tile-moments" type="button" onClick={() => goTo("memory")}>
          <span className="status-icon"><Art name="star" size={20} /></span>
          <strong className="status-title">{moments} {copy.home.sharedMoments}</strong>
          <small className="status-note">
            {moments ? copy.home.sharedMomentsNote : "Your story starts here"}
          </small>
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

/* ----------------------------------------------------------- room card ---- */

/* ------------------------------------------------------------ missions ---- */

/** How many of today's missions Home shows before pointing at the rest. */
const MISSIONS_ON_HOME = 2;

export function MissionsCard() {
  const { state, update, showReward, cue, clock, goTo } = useGame();
  const weeklyDone = state.missions.weekly.entries.filter((entry) => {
    const template = weeklyMissionMap[entry.id];
    return template && entry.progress >= template.target;
  }).length;
  return (
    <Panel title={copy.home.missions} note="Five small reasons to come back — never a streak to lose"
      art="check" className="card-missions" onOpen={() => goTo("journey")} openLabel="Open Journey">
      {/* Home carries today's next steps, not the whole board — three full rows
          cost 301px of a phone page that also has to hold the creature. */}
      <ul className="mission-list">
        {state.missions.daily.slice(0, MISSIONS_ON_HOME).map((entry) => {
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
      {state.missions.daily.length > MISSIONS_ON_HOME && (
        <button className="mission-more" type="button" onClick={() => goTo("journey")}>
          +{state.missions.daily.length - MISSIONS_ON_HOME} more today · see all goals
        </button>
      )}
      <p className="mission-weekly">
        Weekly journey: {weeklyDone}/{state.missions.weekly.entries.length || 3} challenges · {state.missions.weekly.days.length}/5 active days.
        {" "}Missing a day costs nothing.
      </p>
    </Panel>
  );
}

/* ---------------------------------------------------------- activities ---- */

/**
 * Short ways in to the activity scenes.
 *
 * All four are reachable from navigation — Games from the rail, and Cooking,
 * Dream Doors and Friends from the More menu — so Home does not need to repeat
 * them at full size. It repeated them as four 156px tiles, which on a phone was
 * 660px of mostly padlocks. A chip rail keeps them one tap away for a child who
 * will not go hunting in a More menu, at a fifth of the height.
 */
export function ActivityTiles() {
  const { goTo, isOpen } = useGame();
  const tiles = [
    { id: "games" as const, title: copy.home.miniGames, note: copy.home.miniGamesNote, art: "game" },
    { id: "cooking" as const, title: copy.home.cooking, note: copy.home.cookingNote, art: "cook" },
    { id: "dreams" as const, title: copy.home.dreamDoors, note: copy.home.dreamDoorsNote, art: "dream" },
    { id: "friends" as const, title: copy.home.friends, note: copy.home.friendsNote, art: "friends" },
  ];
  return (
    <ul className="activity-rail" aria-label="More to do">
      {tiles.map((tile) => {
        const unlock = isOpen(tile.id);
        return (
          <li key={tile.id}>
            <button
              className={`activity-chip tile-${tile.id} ${unlock.open ? "" : "is-locked"}`}
              type="button"
              aria-disabled={!unlock.open}
              title={unlock.open ? tile.note : unlock.note}
              onClick={() => unlock.open && goTo(tile.id)}
            >
              <span className="activity-art"><Art name={unlock.open ? tile.art : "lock"} size={22} /></span>
              <strong>{tile.title}</strong>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export { routeMap };
