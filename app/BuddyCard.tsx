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
    <section className={`buddy-card bond-${relationship.key}`} aria-label="My Buddy">
      <div className="buddy-head">
        <span className={`buddy-avatar vibe-${identity.vibe}`} aria-hidden="true">
          {vibe.symbol}
        </span>
        <div className="buddy-title">
          <p className="buddy-name">
            <strong>{identity.name}</strong>
            <span className="buddy-vibe">{vibe.name}</span>
          </p>
          <p className="buddy-tagline">{identity.tagline}</p>
        </div>
        <button
          className="buddy-edit"
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${identity.name}'s profile`}
        >
          <span aria-hidden="true">✎</span>
        </button>
      </div>

      <ul className="buddy-facts">
        <li className="buddy-fact buddy-fact-bond">
          <span className="buddy-fact-icon" aria-hidden="true">
            {relationship.symbol}
          </span>
          <span className="buddy-fact-copy">
            <strong>{relationship.name}</strong>
            <span>{fillName(relationship.note, identity.name)}</span>
          </span>
        </li>
        <li className="buddy-fact">
          <span className="buddy-fact-icon" aria-hidden="true">
            ☀
          </span>
          <span className="buddy-fact-copy">
            <strong>{lastCare}</strong>
            <span>{sharedMoments === 1 ? "1 shared moment" : `${sharedMoments} shared moments`}</span>
          </span>
        </li>
        <li className="buddy-fact">
          <span className="buddy-fact-icon" aria-hidden="true">
            ♡
          </span>
          <span className="buddy-fact-copy">
            <strong>{favorite ? `Loves ${favorite}` : "Still learning about you"}</strong>
            <span>{favorite ? "Favourite way to bond" : "Try a tap, a pet or a hold"}</span>
          </span>
        </li>
      </ul>
    </section>
  );
}
