import assert from "node:assert/strict";
import test from "node:test";

import {
  behaviorDefinitions, idleWeightsFor, NiumpiBehaviorMachine,
  type NiumpiBehavior,
} from "../app/anim/NiumpiBehaviorMachine.ts";
import { legacyAnimationForBehavior, semanticBehaviorForLegacy } from "../app/anim/legacyBehaviorAdapter.ts";
import type { AnimState } from "../app/anim/NiumpiAnimationController.ts";

test("every transient behavior traverses anticipation, action and recovery", () => {
  const machine = new NiumpiBehaviorMachine({ seed: "phases", now: 0, idleDelay: [99_000, 99_000] });
  assert.equal(machine.request("dance", 0).snapshot.phase, "anticipation");
  assert.equal(machine.advance(1_000 / 3).phase, "action");
  assert.equal(machine.advance(2_500).phase, "recovery");
  assert.equal(machine.advance(3_000).state, "idle");
});

test("higher priority interrupts and lower priority cannot steal the character", () => {
  const machine = new NiumpiBehaviorMachine({ seed: "priority", now: 0 });
  const dance = machine.request("dance", 0);
  const look = machine.request("look", 20);
  assert.equal(look.accepted, false);
  assert.equal(look.reason, "lower-priority");
  assert.equal(machine.getSnapshot().state, "dance");

  const pet = machine.request("pet", 30);
  assert.equal(pet.accepted, true);
  assert.equal(pet.cancelledToken, dance.snapshot.token);
  assert.equal(pet.snapshot.state, "pet");
});

test("a forced user performance restarts the same semantic state", () => {
  const machine = new NiumpiBehaviorMachine({ seed: "restart", now: 0, idleDelay: [99_000, 99_000] });
  const first = machine.request("happy", 100, { source: "autonomous" });
  assert.equal(first.accepted, true);
  const repeated = machine.request("happy", 140, { source: "user" });
  assert.equal(repeated.accepted, false);
  assert.equal(repeated.reason, "already-active");
  const forced = machine.request("happy", 150, { source: "user", force: true });
  assert.equal(forced.accepted, true);
  assert.equal(forced.snapshot.source, "user");
  assert.notEqual(forced.snapshot.token, first.snapshot.token);
});

test("cancellation is token-aware and uses the authored recovery", () => {
  const machine = new NiumpiBehaviorMachine({ seed: "cancel", now: 0, idleDelay: [99_000, 99_000] });
  const sing = machine.request("sing", 0).snapshot;
  const stale = machine.cancel(100, sing.token + 1);
  assert.equal(stale.accepted, false);
  assert.equal(stale.reason, "stale-token");
  assert.equal(machine.getSnapshot().state, "sing");

  const cancelled = machine.cancel(120, sing.token);
  assert.equal(cancelled.accepted, true);
  assert.equal(cancelled.snapshot.phase, "recovery");
  assert.equal(machine.advance(120 + 2_000 / 3).state, "idle");
});

test("walk, hover and land each use one complete semantic travel performance", () => {
  const machine = new NiumpiBehaviorMachine({ seed: "landing", now: 0, idleDelay: [99_000, 99_000] });
  machine.request("hover", 0);
  assert.equal(machine.advance(2_500).state, "hover");
  assert.equal(machine.advance(2_500).phase, "recovery");
  assert.equal(machine.advance(3_000).state, "idle");
});

test("idle timing and choices replay exactly for the same seed", () => {
  const options = {
    seed: "same-relationship",
    now: 1_000,
    idleDelay: [1_000, 2_000] as const,
    context: { mood: "curious" as const, curiosity: 0.9 },
  };
  const a = new NiumpiBehaviorMachine(options);
  const b = new NiumpiBehaviorMachine(options);
  for (let index = 0; index < 40; index += 1) {
    const left = a.getSnapshot();
    const right = b.getSnapshot();
    assert.deepEqual(left, right);
    const next = left.phaseEndsAt ?? left.nextIdleAt;
    assert.ok(next !== null, "a non-sleeping machine always has a next event");
    assert.deepEqual(a.advance(next!), b.advance(next!));
  }
});

test("timestamps are monotonic even when a stale caller supplies an older clock value", () => {
  const machine = new NiumpiBehaviorMachine({ seed: "clock", now: 1_000, idleDelay: [99_000, 99_000] });
  machine.advance(5_000);
  const result = machine.request("look", 2_000);
  assert.equal(result.snapshot.enteredAt, 5_000);
  assert.ok((result.snapshot.phaseEndsAt ?? 0) >= 5_000);
});

test("a presentation suspension shifts the complete behavior clock without changing phase", () => {
  const machine = new NiumpiBehaviorMachine({ seed: "shared-clock", now: 100, idleDelay: [99_000, 99_000] });
  const before = machine.request("read", 100).snapshot;
  assert.equal(before.phase, "anticipation");
  assert.equal(before.phaseEndsAt, 600);
  assert.equal(machine.advance(400).phase, "anticipation", "the root clock may advance while an atlas decodes");

  const resumed = machine.shiftClock(320);
  assert.equal(resumed.token, before.token);
  assert.equal(resumed.phase, "anticipation");
  assert.equal(resumed.enteredAt, 420);
  assert.equal(resumed.phaseStartedAt, 420);
  assert.equal(resumed.phaseEndsAt, 920);
  assert.equal(machine.advance(401).phase, "anticipation", "retiming must not push the sampling cursor into the future");
  assert.equal(machine.advance(919.9).phase, "anticipation");
  assert.equal(machine.advance(920).phase, "action");
  assert.deepEqual(machine.shiftClock(Number.NaN), machine.getSnapshot(), "invalid shifts are inert");
});

test("mood weights seek matching behavior without forcing false cheer", () => {
  const sad = idleWeightsFor({ mood: "sad", joy: 0.1, energy: 0.7 });
  assert.ok(sad.sad > sad.happy * 20);
  assert.ok(sad.lamp > sad.dance * 20);

  const excited = idleWeightsFor({ mood: "excited", energy: 1, joy: 1, playfulness: 1 });
  assert.ok(excited.dance > excited.read);
  assert.ok(excited.roll > excited.lamp);

  const tired = idleWeightsFor({ mood: "tired", energy: 0.1 });
  assert.ok(tired.read > tired.roll * 20);
});

test("sleep is a held system state and waking passes through recovery", () => {
  const machine = new NiumpiBehaviorMachine({ seed: "sleep", now: 0 });
  let snapshot = machine.setContext({ mood: "sleeping" }, 100);
  assert.equal(snapshot.state, "sleep");
  assert.equal(snapshot.phase, "anticipation");
  snapshot = machine.advance(100 + 2_000 / 3);
  assert.equal(snapshot.phase, "action");
  assert.equal(snapshot.phaseEndsAt, null);
  snapshot = machine.setContext({ mood: "calm" }, 1_000);
  assert.equal(snapshot.state, "sleep");
  assert.equal(snapshot.phase, "recovery");
  assert.equal(machine.advance(1_000 + 2_000 / 3).state, "idle");
});

test("reduced motion removes travel from idle and shortens explicit reactions", () => {
  const weights = idleWeightsFor({ mood: "excited", energy: 1, playfulness: 1 }, true);
  for (const state of ["walk", "hover", "land", "dance", "roll"] as NiumpiBehavior[]) {
    assert.equal(weights[state], 0, `${state} must not be autonomously selected`);
  }

  const machine = new NiumpiBehaviorMachine({
    seed: "reduced", now: 0, reducedMotion: true, idleDelay: [99_000, 99_000],
  });
  let snapshot = machine.request("dance", 0).snapshot;
  assert.equal(snapshot.motionScale, 0);
  assert.equal(snapshot.phaseEndsAt, 80);
  snapshot = machine.advance(80);
  assert.equal(snapshot.phase, "action");
  assert.equal(snapshot.phaseEndsAt, 400);
  assert.equal(machine.advance(480).state, "idle");
});

test("enabling reduced motion cancels an autonomous high-motion moment", () => {
  let chosen: NiumpiBehaviorMachine | null = null;
  for (let index = 0; index < 100; index += 1) {
    const candidate = new NiumpiBehaviorMachine({
      seed: `motion-${index}`, now: 0, idleDelay: [0, 0],
      context: { mood: "excited", energy: 1, joy: 1, playfulness: 1 },
    });
    const state = candidate.advance(0).state;
    if (["walk", "hover", "dance", "roll"].includes(state)) { chosen = candidate; break; }
  }
  assert.ok(chosen, "fixture should find a deterministic high-motion seed");
  const reduced = chosen!.setReducedMotion(true, 1);
  assert.equal(reduced.state, "idle");
  assert.equal(reduced.motionScale, 0);
});

test("legacy adapter covers every old animation and every semantic state", () => {
  const legacy: AnimState[] = [
    "idle", "wander", "float", "spin", "curious", "happy", "sleepy", "asleep", "peek", "sway", "cozy-rest",
    "shimmy", "stretch", "ponder", "book", "window", "lamp", "roll", "singing", "eating", "eating-favorite", "hugging",
    "petting", "tickle", "brushing", "dancing", "waking", "hatching", "evolving", "gift", "cooking",
    "gardening", "playing", "returning",
  ];
  for (const state of legacy) assert.ok(semanticBehaviorForLegacy(state));
  for (const state of Object.keys(behaviorDefinitions) as NiumpiBehavior[]) {
    assert.ok(legacyAnimationForBehavior(state));
  }
});
