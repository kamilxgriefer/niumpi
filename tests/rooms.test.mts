import assert from "node:assert/strict";
import test from "node:test";

import {
  placeItem, playWithItem, roomActivity, saveRoom, switchRoom,
} from "../app/game/actions.ts";
import { createGameState, reconcile } from "../app/game/state.ts";
import {
  roomFamiliarity, roomUnlockProgress, settleRoomUnlocks,
} from "../app/game/rooms.ts";
import type { PlacedItem } from "../app/game/types.ts";

const NOW = 1_760_000_000_000;

function fresh() {
  return createGameState(NOW, "room-test");
}

function relationshipReady() {
  const state = fresh();
  return settleRoomUnlocks({
    ...state,
    niumpi: { ...state.niumpi, stage: 1, bond: 24, careMoments: 18 },
  }, NOW + 1_000);
}

test("a new home has three independent spaces and a compatible active-room mirror", () => {
  const state = fresh();
  assert.equal(state.room.activeRoomId, "living-room");
  assert.deepEqual(Object.keys(state.room.rooms).sort(), ["bedroom", "living-room", "play-nook"]);
  assert.deepEqual(state.room.placed, state.room.rooms["living-room"].placed);
  assert.equal(state.room.theme, state.room.rooms["living-room"].theme);
  assert.notEqual(state.room.placed, state.room.rooms["living-room"].placed, "the compatibility mirror is not shared by reference");
  assert.ok(state.room.rooms["living-room"].unlockedAt);
  assert.equal(state.room.rooms.bedroom.unlockedAt, null);
});

test("a legacy single-room save becomes the living room without losing its layout", () => {
  const legacyItem: PlacedItem = {
    uid: "legacy-sofa", itemId: "cloud-sofa", x: 5, y: 2, flipped: true, layer: 7,
  };
  const state = reconcile({
    ...fresh(),
    room: { theme: "moonlit", placed: [legacyItem] },
  } as never, NOW + 5_000);

  assert.equal(state.room.activeRoomId, "living-room");
  assert.equal(state.room.rooms["living-room"].theme, "moonlit");
  assert.deepEqual(state.room.rooms["living-room"].placed, [legacyItem]);
  assert.equal(state.room.rooms.bedroom.theme, "moonlit");
  assert.deepEqual(state.room.rooms.bedroom.placed, []);
});

test("room unlock progress is honest and unlocks never regress", () => {
  const state = fresh();
  const locked = roomUnlockProgress(state, "play-nook");
  assert.equal(locked.open, false);
  assert.ok(locked.percent >= 0 && locked.percent < 100);
  assert.ok(locked.requirements.some((requirement) => !requirement.complete));

  const opened = relationshipReady();
  assert.equal(roomUnlockProgress(opened, "bedroom").open, true);
  assert.equal(roomUnlockProgress(opened, "play-nook").percent, 100);
  assert.ok(opened.room.rooms.bedroom.unlockedAt);
  assert.ok(opened.room.rooms["play-nook"].unlockedAt);

  const laterDip = {
    ...opened,
    niumpi: { ...opened.niumpi, bond: 0, careMoments: 0 },
  };
  assert.equal(roomUnlockProgress(laterDip, "play-nook").open, true);
});

test("switching refuses locked rooms, then restores each room's own layout", () => {
  const locked = switchRoom(fresh(), "bedroom", NOW + 1_000);
  assert.equal(locked.refused, true);
  assert.equal(locked.state.room.activeRoomId, "living-room");

  let state = relationshipReady();
  const livingTheme = state.room.theme;
  const switched = switchRoom(state, "bedroom", NOW + 2_000);
  assert.equal(switched.refused, undefined);
  assert.equal(switched.state.room.activeRoomId, "bedroom");
  assert.equal(switched.state.room.theme, "moonlit");
  assert.equal(switched.state.room.rooms.bedroom.visits, 1);

  const bed: PlacedItem = {
    uid: "room-bed", itemId: "moon-bed", x: 2, y: 1, flipped: false, layer: 1,
  };
  state = saveRoom(switched.state, [bed], "moonlit", NOW + 3_000).state;
  const home = switchRoom(state, "living-room", NOW + 4_000).state;
  assert.equal(home.room.theme, livingTheme);
  assert.ok(home.room.placed.some((item) => item.itemId === "cloud-sofa"));
  const bedroomAgain = switchRoom(home, "bedroom", NOW + 5_000).state;
  assert.deepEqual(bedroomAgain.room.placed, [bed]);
});

test("placing an item updates the canonical active room and no other space", () => {
  const state = switchRoom(relationshipReady(), "play-nook", NOW + 1_000).state;
  const item: PlacedItem = {
    uid: "play-yarn", itemId: "ball-of-yarn", x: 3, y: 1, flipped: false, layer: 2,
  };
  const placed = placeItem(state, item);
  assert.ok(placed.room.placed.some((entry) => entry.uid === item.uid));
  assert.ok(placed.room.rooms["play-nook"].placed.some((entry) => entry.uid === item.uid));
  assert.equal(placed.room.rooms["living-room"].placed.some((entry) => entry.uid === item.uid), false);
});

test("one owned furnishing cannot be duplicated across two rooms", () => {
  let state = relationshipReady();
  const livingSofa = state.room.rooms["living-room"].placed.find((item) => item.itemId === "cloud-sofa");
  assert.ok(livingSofa);
  state = switchRoom(state, "bedroom", NOW + 1_000).state;
  const duplicate: PlacedItem = {
    uid: "second-sofa", itemId: "cloud-sofa", x: 1, y: 1, flipped: false, layer: 1,
  };
  const saved = saveRoom(state, [duplicate], "moonlit", NOW + 2_000).state;
  assert.equal(saved.room.rooms.bedroom.placed.some((item) => item.itemId === "cloud-sofa"), false);
  assert.equal(saved.room.rooms["living-room"].placed.some((item) => item.itemId === "cloud-sofa"), true);
});

test("room activities enforce context and build a local history", () => {
  const livingRoom = fresh();
  const wrongRoom = roomActivity(livingRoom, "roll", NOW + 1_000);
  assert.equal(wrongRoom.refused, true);
  assert.equal(wrongRoom.state, livingRoom, "a refused activity must not mutate the save");

  const play = switchRoom(relationshipReady(), "play-nook", NOW + 2_000).state;
  const beforeJoy = play.stats.joy;
  const danced = roomActivity(play, "dance", NOW + 3_000);
  assert.equal(danced.refused, undefined);
  assert.equal(danced.behavior, "dancing");
  assert.ok(danced.state.stats.joy >= beforeJoy);
  assert.equal(danced.state.room.rooms["play-nook"].interactions["activity:dance"], 1);
  assert.equal(danced.state.room.rooms["living-room"].interactions["activity:dance"], undefined);
  assert.ok(roomFamiliarity(danced.state.room.rooms["play-nook"]).points >= 2);
});

test("playing with furniture contributes to the active room's familiarity", () => {
  const state = fresh();
  const played = playWithItem(state, "cloud-sofa", NOW + 1_000);
  assert.equal(played.state.room.rooms["living-room"].interactions["item:cloud-sofa"], 1);
  assert.equal(roomFamiliarity(played.state.room.rooms["living-room"]).points, 1);
});

test("different furnishings use different authored movement vocabularies", () => {
  assert.equal(playWithItem(fresh(), "cloud-sofa", NOW + 1_000).behavior, "sway");
  assert.equal(playWithItem(fresh(), "music-radio", NOW + 2_000).behavior, "singing");
  assert.equal(playWithItem(fresh(), "memory-shelf", NOW + 3_000).behavior, "book");
  assert.equal(playWithItem(fresh(), "telescope", NOW + 4_000).behavior, "window");
});
