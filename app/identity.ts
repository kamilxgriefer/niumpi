import type { NiumpiBehavior } from "./RiggedNiumpi";

export type PetVibe = "energetic" | "chill" | "curious";

export type PetIdentity = {
  name: string;
  tagline: string;
  vibe: PetVibe;
  bornAt: string;
  onboarded: boolean;
};

export const NAME_LIMIT = 14;
export const TAGLINE_LIMIT = 34;

export const DEFAULT_IDENTITY: PetIdentity = {
  name: "Niumpi",
  tagline: "Still looking for the right words",
  vibe: "curious",
  bornAt: "",
  onboarded: false,
};

export const vibeOrder: PetVibe[] = ["energetic", "chill", "curious"];

export const vibes: Record<
  PetVibe,
  { name: string; blurb: string; symbol: string; greeting: string }
> = {
  energetic: {
    name: "Energetic",
    blurb: "Bouncy and silly, always up for one more game",
    symbol: "✦",
    greeting: "Nium nium! Let's play!",
  },
  chill: {
    name: "Chill",
    blurb: "Soft and slow, happiest while floating",
    symbol: "☁",
    greeting: "Niuuum… this is nice.",
  },
  curious: {
    name: "Curious",
    blurb: "Watches everything and wonders about it",
    symbol: "⌁",
    greeting: "Nium? What are you doing?",
  },
};

/** Vibe nudges which spontaneous moods show up most often. */
export const vibeBehaviors: Record<PetVibe, NiumpiBehavior[]> = {
  energetic: ["spin", "happy", "wander"],
  chill: ["float", "sleepy", "float"],
  curious: ["curious", "curious", "wander"],
};

export const nameIdeas = [
  "Niumpi",
  "Bubu",
  "Pipko",
  "Mango",
  "Tinu",
  "Kiwi",
  "Momo",
  "Pepin",
  "Lulu",
  "Bimbi",
  "Zuzu",
  "Fifi",
  "Ollie",
  "Nemo",
  "Puffin",
];

export const taglineIdeas = [
  "Tiny explorer of soft things",
  "Professional cloud watcher",
  "Collects giggles and leaves",
  "Naps first, thinks later",
  "Ready for one more hug",
  "Believes the floor is optional",
  "Small, round and very brave",
];

/** Picks a random entry, never repeating the value already on screen. */
export function suggestFrom(list: readonly string[], avoid: string): string {
  const options = list.filter((item) => item.toLowerCase() !== avoid.trim().toLowerCase());
  const pool = options.length ? options : list;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function sanitizeName(value: string): string {
  const cleaned = value.replace(/\s+/g, " ").trimStart().slice(0, NAME_LIMIT);
  return cleaned;
}

export function sanitizeTagline(value: string): string {
  return value.replace(/\s+/g, " ").trimStart().slice(0, TAGLINE_LIMIT);
}

/** Everything a saved identity needs before it reaches the rest of the game. */
export function settleIdentity(draft: PetIdentity, now: string): PetIdentity {
  const name = sanitizeName(draft.name).trim();
  const tagline = sanitizeTagline(draft.tagline).trim();
  return {
    name: name || DEFAULT_IDENTITY.name,
    tagline: tagline || DEFAULT_IDENTITY.tagline,
    vibe: vibeOrder.includes(draft.vibe) ? draft.vibe : DEFAULT_IDENTITY.vibe,
    bornAt: draft.bornAt || now,
    onboarded: true,
  };
}

export type Relationship = {
  key: "new" | "warming" | "friends" | "close" | "inseparable";
  name: string;
  note: string;
  symbol: string;
};

const relationshipStages: Relationship[] = [
  { key: "new", name: "Just met", note: "Say hello with a gentle tap", symbol: "◌" },
  { key: "warming", name: "Warming up", note: "{name} is starting to trust you", symbol: "･" },
  { key: "friends", name: "Good friends", note: "You two have a rhythm now", symbol: "✧" },
  { key: "close", name: "Close buddies", note: "{name} lights up when you arrive", symbol: "♡" },
  { key: "inseparable", name: "Inseparable", note: "Two hearts, one silly little sound", symbol: "❥" },
];

export function relationshipFor(bond: number, sharedMoments: number): Relationship {
  if (sharedMoments < 3 || bond < 38) return relationshipStages[0];
  if (bond < 56) return relationshipStages[1];
  if (bond < 74) return relationshipStages[2];
  if (bond < 92) return relationshipStages[3];
  return relationshipStages[4];
}

export function fillName(text: string, name: string): string {
  return text.replace(/\{name\}/g, name);
}

export function startOfDay(value: number): number {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Calendar days between an ISO stamp and now, or null when the stamp is unusable. */
export function daysSince(iso: string, now: number): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000));
}

export function lastCareLabel(iso: string, now: number): string {
  const days = daysSince(iso, now);
  if (days === null) return "Waiting for a first hello";
  if (days === 0) return "Cared for today";
  if (days === 1) return "Cared for yesterday";
  if (days < 7) return `Cared for ${days} days ago`;
  if (days < 14) return "Cared for last week";
  return "Cared for a while ago";
}

export function isFirstCareToday(iso: string, now: number): boolean {
  const days = daysSince(iso, now);
  return days === null || days > 0;
}
