import assert from "node:assert/strict";
import test from "node:test";

import {
  bodyPath,
  growthStages,
  profileFor,
  tipRise,
} from "../app/game/config/growth.ts";

/**
 * The old model had no hatchling: stage 1 was already "Sprouting", and the rig
 * drew every stage from one adult bitmap at one fixed size. These tests pin the
 * shape of growth itself, which is only testable because it is data now.
 */

const grown = growthStages.filter((stage) => stage.id >= 1);

test("a hatchling stage exists between the egg and sprouting", () => {
  const hatchling = profileFor(1);
  assert.equal(hatchling.name, "Hatchling");
  assert.equal(profileFor(2).name, "Sprouting");
  // It is the stage a player meets first, so it must be reachable quickly.
  assert.ok(hatchling.days === 0, "the hatchling must not be gated behind a day");
});

test("the creature grows: every stage is larger than the one before", () => {
  for (let i = 1; i < grown.length; i += 1) {
    assert.ok(
      grown[i].scale > grown[i - 1].scale,
      `stage ${grown[i].id} (${grown[i].scale}) is not larger than stage ${grown[i - 1].id} (${grown[i - 1].scale})`,
    );
  }
  // A hatchling should read as genuinely small next to a grown Niumpi, not as
  // the same creature nudged down a few percent. Measured on the real stage,
  // going below about two thirds stops reading as small and starts reading as
  // lost in the room — the proportions carry the rest.
  assert.ok(grown[0].scale <= grown[grown.length - 1].scale * 0.65);
});

test("babyness is proportion, not size: eyes shrink relative to the body", () => {
  // The single strongest cue that something is young. If this inverts, a
  // hatchling starts reading as a small adult however much we scale it down.
  const ratios = grown.map((stage) => stage.face.eyeR / stage.body.rx);
  for (let i = 1; i < ratios.length; i += 1) {
    assert.ok(
      ratios[i] < ratios[i - 1],
      `stage ${grown[i].id} eye ratio ${ratios[i].toFixed(3)} is not smaller than ${ratios[i - 1].toFixed(3)}`,
    );
  }
});

test("the silhouette draws out from a nub into a point", () => {
  const rises = grown.map((stage) => tipRise(stage.body) / stage.body.ry);
  for (let i = 1; i < rises.length; i += 1) {
    assert.ok(
      rises[i] > rises[i - 1],
      `stage ${grown[i].id} tip ${rises[i].toFixed(2)} is not longer than ${rises[i - 1].toFixed(2)}`,
    );
  }
  // The hatchling keeps barely a bump, which is what makes it round.
  assert.ok(rises[0] < 0.4, "the hatchling should be almost round");
});

test("no facial feature escapes the silhouette", () => {
  for (const stage of grown) {
    const { body, face } = stage;
    assert.ok(
      face.eyeGap + face.eyeR <= body.rx,
      `stage ${stage.id}: eyes reach ${face.eyeGap + face.eyeR} past a half-width of ${body.rx}`,
    );
    assert.ok(
      face.cheekGap + face.cheekR <= body.rx,
      `stage ${stage.id}: cheeks reach ${face.cheekGap + face.cheekR} past a half-width of ${body.rx}`,
    );
    assert.ok(face.mouthY > face.eyeY, `stage ${stage.id}: the mouth is above the eyes`);
  }
});

test("leaves follow the documented bond progression", () => {
  assert.deepEqual(grown.map((stage) => stage.leaves), [1, 2, 3, 5, 5]);
  // Arms arrive gradually rather than appearing fully formed.
  assert.equal(profileFor(1).arms, "none");
  assert.equal(profileFor(5).arms, "full");
});

test("every stage produces a closed, finite path", () => {
  for (const stage of growthStages) {
    const path = bodyPath(stage.body);
    assert.ok(path.endsWith("Z"), `stage ${stage.id} path is not closed`);
    assert.doesNotMatch(path, /NaN|Infinity|undefined/, `stage ${stage.id} path has a bad number`);
  }
});

test("stage lookup is total and never throws", () => {
  for (const input of [-3, 0, 1, 5, 9, 2.4]) {
    const profile = profileFor(input);
    assert.ok(profile.name.length > 0, `no profile for ${input}`);
  }
});

test("care thresholds only ever climb", () => {
  for (let i = 1; i < growthStages.length; i += 1) {
    assert.ok(
      growthStages[i].careMoments > growthStages[i - 1].careMoments,
      `stage ${growthStages[i].id} does not cost more care than the one before`,
    );
  }
});
