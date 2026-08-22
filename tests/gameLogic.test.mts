import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_IDENTITY,
  NAME_LIMIT,
  TAGLINE_LIMIT,
  daysSince,
  fillName,
  isFirstCareToday,
  lastCareLabel,
  relationshipFor,
  sanitizeName,
  sanitizeTagline,
  settleIdentity,
  startOfDay,
  suggestFrom,
  vibeBehaviors,
  vibes,
} from "../app/identity.ts";

const DAY = 86_400_000;

test("relationship levels rise with bond once a few moments are shared", () => {
  assert.equal(relationshipFor(90, 2).key, "new");
  assert.equal(relationshipFor(20, 40).key, "new");
  assert.equal(relationshipFor(38, 40).key, "warming");
  assert.equal(relationshipFor(56, 40).key, "friends");
  assert.equal(relationshipFor(74, 40).key, "close");
  assert.equal(relationshipFor(92, 40).key, "inseparable");
});

test("every relationship stage exposes the level shown next to the bond meter", () => {
  const levels = [2, 40, 60, 80, 100].map((bond) => relationshipFor(bond, 40).level);
  assert.deepEqual(levels, [1, 2, 3, 4, 5]);
});

test("the relationship note is personalised with the pet name", () => {
  assert.equal(fillName("{name} is starting to trust you", "Mango"), "Mango is starting to trust you");
  assert.equal(fillName("Two hearts", "Mango"), "Two hearts");
});

test("last care is described in calendar days", () => {
  const now = startOfDay(Date.now()) + 11 * 3_600_000;
  assert.equal(lastCareLabel("", now), "Waiting for a first hello");
  assert.equal(lastCareLabel("not-a-date", now), "Waiting for a first hello");
  assert.equal(lastCareLabel(new Date(now).toISOString(), now), "Cared for today");
  assert.equal(lastCareLabel(new Date(now - DAY).toISOString(), now), "Cared for yesterday");
  assert.equal(lastCareLabel(new Date(now - 3 * DAY).toISOString(), now), "Cared for 3 days ago");
  assert.equal(lastCareLabel(new Date(now - 9 * DAY).toISOString(), now), "Cared for last week");
  assert.equal(lastCareLabel(new Date(now - 40 * DAY).toISOString(), now), "Cared for a while ago");
});

test("days since a visit is never negative", () => {
  const now = startOfDay(Date.now());
  assert.equal(daysSince(new Date(now + 5 * DAY).toISOString(), now), 0);
  assert.equal(daysSince("", now), null);
});

test("the first moment of a day is recognised once", () => {
  const now = startOfDay(Date.now()) + 9 * 3_600_000;
  assert.equal(isFirstCareToday("", now), true);
  assert.equal(isFirstCareToday(new Date(now - DAY).toISOString(), now), true);
  assert.equal(isFirstCareToday(new Date(now - 60_000).toISOString(), now), false);
});

test("names and taglines are trimmed to a readable length", () => {
  // A trailing space survives while typing; settleIdentity trims it on save.
  assert.equal(sanitizeName("  Mango   Two "), "Mango Two ");
  assert.equal(sanitizeName("x".repeat(40)).length, NAME_LIMIT);
  assert.equal(sanitizeTagline("y".repeat(80)).length, TAGLINE_LIMIT);
  assert.equal(settleIdentity({ ...DEFAULT_IDENTITY, name: "Mango " }, "2026-01-01T00:00:00.000Z").name, "Mango");
});

test("an empty profile falls back to the default identity", () => {
  const settled = settleIdentity({ ...DEFAULT_IDENTITY, name: "   ", tagline: "  " }, "2026-01-01T00:00:00.000Z");
  assert.equal(settled.name, DEFAULT_IDENTITY.name);
  assert.equal(settled.tagline, DEFAULT_IDENTITY.tagline);
  assert.equal(settled.onboarded, true);
  assert.equal(settled.bornAt, "2026-01-01T00:00:00.000Z");
});

test("an unknown vibe is repaired instead of rendering nothing", () => {
  const settled = settleIdentity(
    { ...DEFAULT_IDENTITY, vibe: "sparkly" as never },
    "2026-01-01T00:00:00.000Z",
  );
  assert.ok(Object.keys(vibes).includes(settled.vibe));
});

test("a birthday is kept once it exists", () => {
  const settled = settleIdentity(
    { ...DEFAULT_IDENTITY, bornAt: "2025-05-05T00:00:00.000Z" },
    "2026-01-01T00:00:00.000Z",
  );
  assert.equal(settled.bornAt, "2025-05-05T00:00:00.000Z");
});

test("suggestions never repeat what is already on screen", () => {
  const list = ["Bubu", "Momo"];
  for (let attempt = 0; attempt < 40; attempt += 1) {
    assert.equal(suggestFrom(list, "Bubu"), "Momo");
  }
  assert.equal(suggestFrom(["Solo"], "Solo"), "Solo");
});

test("each vibe nudges behaviour without inventing new states", () => {
  const known = new Set(["idle", "wander", "float", "spin", "curious", "happy", "sleepy", "asleep"]);
  for (const vibe of Object.keys(vibes)) {
    const nudges = vibeBehaviors[vibe as keyof typeof vibeBehaviors];
    assert.ok(nudges.length > 0);
    for (const behaviour of nudges) assert.ok(known.has(behaviour), `${behaviour} is not a rig behaviour`);
  }
});
