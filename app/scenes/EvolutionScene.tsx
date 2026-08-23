"use client";

import { Art } from "../ui/Art";
import { RoutePortrait } from "../ui/RoutePortrait";
import { Meter, Panel } from "../ui/parts";
import { useGame } from "../ui/GameProvider";
import { routes, prismaticRequirements } from "../game/config/routes";
import { stages, stageMap } from "../game/config/stages";
import { vectorIds } from "../game/state";
import { meetsPrismatic, phenotypeNotes, routeOutlook } from "../game/evolution";
import { stageProgress } from "../game/care";
import { copy } from "../game/config/copy";

export function EvolutionScene() {
  const { state, now } = useGame();
  const outlook = routeOutlook(state);
  const progress = stageProgress(state, now);
  const locked = state.evolution.lockedRoute;
  const notes = phenotypeNotes(state);
  const maxVector = Math.max(1, ...vectorIds.map((id) => state.evolution.vectors[id]));

  return (
    <div className="scene scene-evolution">
      <header className="scene-head">
        <div>
          <h1>{copy.home.evolution}</h1>
          <p>{copy.home.evolutionNote}</p>
        </div>
      </header>

      <Panel title="The main line" art="evolution">
        <ol className="evo-track">
          {stages.map((stage) => (
            <li key={stage.id} className={[
              state.niumpi.stage > stage.id ? "is-done" : "",
              state.niumpi.stage === stage.id ? "is-current" : "",
            ].filter(Boolean).join(" ")}>
              <span className="evo-node"><Art name={stage.art} size={26} /></span>
              <strong>{stage.name}</strong>
              <small>{stage.blurb}</small>
            </li>
          ))}
        </ol>
        <div className="evo-progress">
          <Meter label={`${progress.careMoments} / ${progress.careTarget} care moments`}
            value={progress.careMoments} max={progress.careTarget} />
          <p className="soft-note">
            {progress.next
              ? `Next: ${progress.next}. Care does most of the work; a little time does the rest (${progress.daysDone}/${progress.daysTarget} days).`
              : "Fully grown — and still changing in small ways."}
          </p>
        </div>
      </Panel>

      <Panel title="Where this is heading" art="spark"
        note={locked ? "This is settled now." : "Nothing is locked in yet."}>
        <p className="evo-outlook">{outlook.hint}</p>
        {!locked && (
          <Meter label={`Direction is ${outlook.confidence}% clear`} value={outlook.confidence} max={100} />
        )}
        <ul className="vector-list">
          {vectorIds.map((id) => (
            <li key={id}>
              <span className="vector-name">{id}</span>
              <span className="vector-track">
                <span className="vector-fill" style={{ width: `${(state.evolution.vectors[id] / maxVector) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <ul className="route-grid">
        {routes.map((route) => {
          const isLocked = locked === route.id;
          const isLeading = !locked && outlook.leading === route.id;
          return (
            <li key={route.id} className={[
              `route-card route-${route.id}`,
              isLocked ? "is-locked-in" : "",
              isLeading ? "is-leading" : "",
              route.rare ? "is-rare" : "",
            ].filter(Boolean).join(" ")}>
              <header>
                <RoutePortrait id={route.id} size={56} />
                <div>
                  <h3>{route.name}{route.rare && <em> (rare)</em>}</h3>
                  <p>{route.tagline}</p>
                </div>
                {isLocked && <span className="route-flag">Chosen</span>}
                {isLeading && <span className="route-flag is-soft">Leading</span>}
              </header>
              <dl className="route-detail">
                <dt>Character</dt><dd>{route.character.join(", ")}</dd>
                <dt>Look</dt><dd>{route.look.join(" · ")}</dd>
                <dt>How to grow it</dt><dd>{route.grow.join(" · ")}</dd>
                <dt>Unlocks</dt><dd>{route.unlocks.join(" · ")}</dd>
              </dl>
            </li>
          );
        })}
      </ul>

      <Panel title="Prismatic" art="prism" note="A rare route for balanced, long, close care">
        <ul className="prism-checks">
          <li className={state.niumpi.bond >= prismaticRequirements.bond ? "is-met" : ""}>
            Bond {Math.round(state.niumpi.bond)} / {prismaticRequirements.bond}
          </li>
          <li className={Object.values(state.personality.talents).filter((level) => level >= 2).length >= prismaticRequirements.talents ? "is-met" : ""}>
            Talents at level 2+: {Object.values(state.personality.talents).filter((level) => level >= 2).length} / {prismaticRequirements.talents}
          </li>
          <li className={state.memories.length >= prismaticRequirements.memories ? "is-met" : ""}>
            Memories {state.memories.length} / {prismaticRequirements.memories}
          </li>
          <li className={meetsPrismatic(state) ? "is-met" : ""}>Care spread across every direction</li>
        </ul>
      </Panel>

      {notes.length > 0 && (
        <Panel title="What shaped this look" art="personality">
          <ul className="phenotype-notes">
            {notes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </Panel>
      )}

      {state.evolution.history.length > 0 && (
        <Panel title="History" art="book">
          <ul className="evo-history">
            {state.evolution.history.map((entry) => (
              <li key={entry.at}>
                <strong>{new Date(entry.at).toLocaleDateString()}</strong>
                {" — "}{stageMap[entry.stage].name}
                {entry.route ? `, heading toward ${entry.route}` : ""}
                <small> (strongest: {entry.top.join(", ")})</small>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
