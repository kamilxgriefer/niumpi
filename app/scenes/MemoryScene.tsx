"use client";

import { useState } from "react";
import { Art } from "../ui/Art";
import { EmptyState, Modal, Panel, TabBar } from "../ui/parts";
import { useGame } from "../ui/GameProvider";
import { memoryFilters } from "../game/config/memories";
import { seedQuestions, seedMap } from "../game/config/seeds";
import { traitMap } from "../game/config/traits";
import { filterMemories, removeMemory, toggleFavorite } from "../game/memories";
import { answerSeed, forgetSeed } from "../game/actions";
import { copy } from "../game/config/copy";

export function MemoryScene() {
  const { state, update, run, clock } = useGame();
  const [filter, setFilter] = useState("all");
  const [seedsOpen, setSeedsOpen] = useState(false);
  const entries = filterMemories(state, filter);

  return (
    <div className="scene scene-memory">
      <header className="scene-head">
        <div>
          <h1>Memory</h1>
          <p>Everything worth keeping, in the order it happened.</p>
        </div>
        <button className="ghost-button" type="button" onClick={() => setSeedsOpen(true)}>
          <Art name="leaf" size={16} /> Memory Seeds
        </button>
      </header>

      <TabBar label="Memory filters" active={filter} onSelect={setFilter} tabs={memoryFilters} />

      {entries.length === 0 ? (
        <EmptyState art="memory" title="No memories here yet"
          note="Milestones, dreams and discoveries all end up in this album." />
      ) : (
        <ul className="memory-album">
          {entries.map((entry) => (
            <li key={entry.id} className={`memory-card kind-${entry.kind}`}>
              <span className="memory-art"><Art name={entry.art} size={38} /></span>
              <div className="memory-copy">
                <p className="memory-date">{new Date(entry.createdAt).toLocaleDateString()}</p>
                <h3>{entry.title}</h3>
                <p>{entry.body}</p>
                {entry.quote && <blockquote>“{entry.quote}”</blockquote>}
                {entry.trait && traitMap[entry.trait] && (
                  <p className="memory-trait">Trait: {traitMap[entry.trait].name}</p>
                )}
              </div>
              <div className="memory-tools">
                <button
                  className={`icon-button ${entry.favorite ? "is-on" : ""}`}
                  type="button"
                  aria-pressed={entry.favorite}
                  aria-label={entry.favorite ? "Remove from favourites" : "Add to favourites"}
                  onClick={() => update(toggleFavorite(state, entry.id))}
                >
                  <Art name="heart" size={16} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Delete ${entry.title}`}
                  onClick={() => update(removeMemory(state, entry.id))}
                >
                  <Art name="close" size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {seedsOpen && (
        <Modal title="Memory Seeds" note={copy.safety.seedPrivacy} onClose={() => setSeedsOpen(false)} wide>
          <Panel tone="pastel">
            <label className="switch-row">
              <input
                type="checkbox"
                checked={state.profile.settings.seedQuestions}
                onChange={(event) => update({
                  ...state,
                  profile: { ...state.profile, settings: { ...state.profile.settings, seedQuestions: event.target.checked } },
                })}
              />
              <span>Ask me these questions</span>
            </label>
          </Panel>
          <ul className="seed-answers">
            {seedQuestions.map((question) => {
              const answer = state.seedAnswers[question.id];
              return (
                <li key={question.id} className={answer ? "is-answered" : ""}>
                  <p className="seed-answer-prompt">{question.prompt}</p>
                  <div className="seed-answer-row">
                    {question.options.map((option, index) => (
                      <button
                        key={option.label}
                        className={`seed-answer ${answer?.choice === index ? "is-picked" : ""}`}
                        type="button"
                        onClick={() => run(answerSeed(state, question.id, index as 0 | 1, clock()))}
                      >
                        <Art name={option.art} size={18} /> {option.label}
                      </button>
                    ))}
                    {answer && (
                      <button className="icon-button" type="button" aria-label={`Forget the answer to: ${question.prompt}`}
                        onClick={() => update(forgetSeed(state, question.id))}>
                        <Art name="close" size={14} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Modal>
      )}
    </div>
  );
}

export { seedMap };
