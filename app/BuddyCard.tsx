"use client";

import { fillName, vibes } from "./identity";
import type { PetIdentity, Relationship } from "./identity";

type Props = {
  identity: PetIdentity;
  relationship: Relationship;
  lastCare: string;
  sharedMoments: number;
  favorite: string | null;
  onEdit: () => void;
};

export function BuddyCard({
  identity,
  relationship,
  lastCare,
  sharedMoments,
  favorite,
  onEdit,
}: Props) {
  const vibe = vibes[identity.vibe];

  return (
    <section className={`companion-card bond-${relationship.key}`} aria-label="My Buddy">
      <div className="companion-head">
        <span className={`companion-avatar vibe-${identity.vibe}`} aria-hidden="true">
          {vibe.symbol}
        </span>
        <div className="companion-title">
          <p className="companion-name">
            <strong>{identity.name}</strong>
            <span className="companion-vibe">{vibe.name}</span>
          </p>
          <p className="companion-tagline">{identity.tagline}</p>
        </div>
        <button
          className="companion-edit"
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${identity.name}'s profile`}
        >
          <span aria-hidden="true">✎</span>
        </button>
      </div>

      <ul className="companion-facts">
        <li className="fact fact-moments">
          <span className="fact-icon" aria-hidden="true">✦</span>
          <span className="fact-copy">
            <strong>
              {sharedMoments} shared {sharedMoments === 1 ? "moment" : "moments"}
            </strong>
            <span>{lastCare}</span>
          </span>
        </li>
        <li className="fact fact-bond">
          <span className="fact-icon" aria-hidden="true">{relationship.symbol}</span>
          <span className="fact-copy">
            <strong>{relationship.name}</strong>
            <span>{fillName(relationship.note, identity.name)}</span>
          </span>
        </li>
        <li className="fact fact-favorite">
          <span className="fact-icon" aria-hidden="true">♡</span>
          <span className="fact-copy">
            <strong>{favorite ? `Loves ${favorite}` : "Still learning about you"}</strong>
            <span>{favorite ? "Favourite way to bond" : "The journey has just begun"}</span>
          </span>
        </li>
      </ul>
    </section>
  );
}
