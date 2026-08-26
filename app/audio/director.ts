import type { MoodId, RouteId, SceneId, StageId, WeatherId } from "../game/types";

/** Stable IDs shared by the authored asset manifest and the Web Audio runtime. */
export type AudioAssetId =
  | "music_base" | "music_warmth" | "music_sparkle"
  | "ambience_room" | "ambience_garden"
  | "ui_hover" | "ui_tap" | "ui_confirm" | "ui_reward" | "ui_fail"
  | "pet_soft" | "pet_purr" | "hold_warm" | "leaf_rustle"
  | "eat_anticipate" | "bite_1" | "bite_2" | "bite_3" | "swallow"
  | "happy_peak" | "sad_drop" | "sad_sigh"
  | "sleep_settle" | "sleep_breath" | "sleep_murmur" | "wake_rise"
  | "wash_splash" | "wash_brush"
  | "lamp_reach" | "lamp_glow"
  | "book_open" | "page_turn" | "book_discovery" | "book_close"
  | "dance_beat_1" | "dance_beat_2" | "dance_beat_3" | "dance_beat_4"
  | "dance_air" | "dance_land"
  | "sing_inhale" | "sing_phrase_1" | "sing_phrase_2" | "sing_phrase_3"
  | "sing_hold" | "sing_release"
  | "roll_launch" | "roll_contact" | "roll_half" | "roll_land" | "roll_dizzy"
  | "travel_depart" | "travel_pulse_1" | "travel_pulse_2" | "travel_apex"
  | "travel_land" | "travel_arrive"
  | "cozy_contact" | "cozy_sigh" | "cozy_release"
  | "hatch_reveal" | "hatch_settled" | "evolve_rise"
  | "loot_rare" | "loot_legendary" | "look_left" | "look_right";

export const musicStemIds = ["music_base", "music_warmth", "music_sparkle"] as const;
export type MusicStemId = (typeof musicStemIds)[number];
export const ambienceIds = ["ambience_room", "ambience_garden"] as const;
export type AmbienceId = (typeof ambienceIds)[number];

export type SoundscapeState = {
  scene: SceneId;
  stage: StageId;
  route: RouteId | null;
  mood: MoodId;
  weather: WeatherId;
  sleeping: boolean;
  lampOn: boolean;
  musicEnabled: boolean;
  effectsEnabled: boolean;
  lowPower: boolean;
};

export type SoundscapeMix = {
  stems: Record<MusicStemId, number>;
  ambience: Record<AmbienceId, number>;
  /** Musical-bus low-pass cutoff in Hz. */
  lowpassHz: number;
  /** Seconds used for musical crossfades. */
  transitionSeconds: number;
};

const sceneMix: Record<SceneId, [number, number, number]> = {
  seed: [0.46, 0.72, 0.08],
  home: [0.68, 0.58, 0.32],
  niumpi: [0.72, 0.64, 0.38],
  room: [0.62, 0.72, 0.28],
  memory: [0.52, 0.76, 0.12],
  garden: [0.58, 0.60, 0.42],
  games: [0.72, 0.30, 0.88],
  shop: [0.58, 0.42, 0.52],
  journey: [0.70, 0.52, 0.62],
  evolution: [0.80, 0.68, 0.74],
  cooking: [0.68, 0.44, 0.66],
  dreams: [0.42, 0.84, 0.10],
  friends: [0.70, 0.54, 0.56],
  about: [0.50, 0.64, 0.18],
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/**
 * One continuous score, orchestrated rather than restarted between screens.
 * All stems share a sample-exact loop, so scene changes are gain/filter moves.
 */
export function mixForSoundscape(state: SoundscapeState): SoundscapeMix {
  let [base, warmth, sparkle] = sceneMix[state.scene];
  let lowpassHz = 12_000;

  // The same melodic identity grows with Niumpi instead of switching to an
  // unrelated track. Early forms are intimate; mature forms reveal the full
  // arrangement and their route gently changes the orchestration.
  const growth = Math.max(0, Math.min(1, (state.stage - 1) / 4));
  warmth *= 0.72 + growth * 0.28;
  sparkle *= 0.52 + growth * 0.48;
  if (state.route === "moonveil") {
    warmth += 0.08;
    sparkle += 0.06;
    lowpassHz = 8_200;
  } else if (state.route === "bloomheart") {
    warmth += 0.16;
    sparkle *= 0.86;
  } else if (state.route === "sparkleap") {
    base += 0.07;
    sparkle += 0.18;
  } else if (state.route === "mistwander") {
    warmth += 0.11;
    sparkle *= 0.72;
    lowpassHz = 6_800;
  } else if (state.route === "prismatic") {
    base += 0.08;
    warmth += 0.10;
    sparkle += 0.16;
  }

  if (state.mood === "excited") {
    sparkle += 0.18;
    base += 0.05;
  } else if (state.mood === "happy") {
    warmth += 0.06;
    sparkle += 0.05;
  } else if (state.mood === "curious") {
    sparkle += 0.09;
    warmth -= 0.04;
  } else if (state.mood === "upset") {
    warmth += 0.10;
    sparkle *= 0.18;
    lowpassHz = 2_600;
  } else if (state.mood === "tired" || state.mood === "hungry") {
    base *= 0.78;
    warmth += 0.08;
    sparkle *= 0.28;
    lowpassHz = 3_800;
  }

  if (state.sleeping || state.mood === "dreaming") {
    base = 0.35;
    warmth = 0.78;
    sparkle = 0.035;
    lowpassHz = state.lampOn ? 1_900 : 1_300;
  }

  if (state.weather === "rainy") {
    warmth += 0.06;
    sparkle *= 0.78;
    lowpassHz = Math.min(lowpassHz, 6_500);
  } else if (state.weather === "storm") {
    base += 0.08;
    warmth += 0.10;
    sparkle *= 0.62;
    lowpassHz = Math.min(lowpassHz, 4_800);
  } else if (state.weather === "starfall") {
    sparkle += 0.16;
  }

  const roomAmbience = ["home", "niumpi", "room", "memory", "cooking", "dreams"].includes(state.scene)
    ? (state.sleeping ? 0.24 : 0.14)
    : 0;
  const gardenAmbience = state.scene === "garden"
    ? 0.34
    : state.weather === "rainy" || state.weather === "storm" ? 0.12 : 0;

  const economy = state.lowPower ? 0.72 : 1;
  return {
    stems: {
      music_base: state.musicEnabled ? clamp(base) : 0,
      music_warmth: state.musicEnabled ? clamp(warmth) : 0,
      music_sparkle: state.musicEnabled ? clamp(sparkle) * economy : 0,
    },
    ambience: {
      ambience_room: state.musicEnabled ? roomAmbience * economy : 0,
      ambience_garden: state.musicEnabled ? gardenAmbience * economy : 0,
    },
    lowpassHz,
    transitionSeconds: state.sleeping ? 2.8 : 1.35,
  };
}

export type SpriteAudioEvent = {
  sequence: number;
  type: string;
  clip: string;
  authoredFrame: number;
  observedFrame: number;
  payload?: Record<string, string | number | boolean>;
  synthetic: boolean;
  spriteToken: number;
};

function numbered(prefix: "bite" | "dance_beat" | "sing_phrase" | "travel_pulse", value: unknown, max: number) {
  const number = Math.max(1, Math.min(max, Math.round(Number(value) || 1)));
  return `${prefix}_${number}` as AudioAssetId;
}

/** Maps authored animation markers to original sounds. Start/complete markers stay silent. */
export function assetForSpriteEvent(event: SpriteAudioEvent): AudioAssetId | null {
  switch (event.type) {
    case "clip_start":
      if (event.clip === "look_left") return "look_left";
      if (event.clip === "look_right") return "look_right";
      return null;
    case "bite": return numbered("bite", event.payload?.bite, 3);
    case "swallow": return "swallow";
    case "joy_peak": return "happy_peak";
    case "impact": return "pet_soft";
    case "airborne": return event.clip === "tap_reaction" ? "dance_air" : null;
    case "land": return event.clip === "tap_reaction" ? "dance_land" : null;
    case "sad_drop": return "sad_drop";
    case "sad_sigh": return "sad_sigh";
    case "sleep_eyes_closed": return "sleep_settle";
    case "sleep_breath": return "sleep_breath";
    case "sleep_murmur": return "sleep_murmur";
    case "sleep_exit": return "wake_rise";
    case "lamp_reach": return "lamp_reach";
    case "lamp_contact": return "ui_tap";
    case "lamp_glow": return "lamp_glow";
    case "lamp_release": return "ui_hover";
    case "book_open": return "book_open";
    case "page_turn": return "page_turn";
    case "book_discovery": return "book_discovery";
    case "book_close": return "book_close";
    case "dance_beat": return numbered("dance_beat", event.payload?.index, 4);
    case "dance_airborne": return "dance_air";
    case "dance_contact": return "dance_land";
    case "sing_inhale": return "sing_inhale";
    case "vocal_phrase": return numbered("sing_phrase", event.payload?.index, 3);
    case "sing_held_note": return "sing_hold";
    case "sing_release": return "sing_release";
    case "roll_launch": return "roll_launch";
    case "roll_contact": return "roll_contact";
    case "roll_half": return "roll_half";
    case "roll_land": return "roll_land";
    case "roll_dizzy": return "roll_dizzy";
    case "travel_depart": return "travel_depart";
    case "travel_pulse": return numbered("travel_pulse", event.payload?.index, 2);
    case "travel_apex": return "travel_apex";
    case "travel_land": return "travel_land";
    case "travel_arrive": return "travel_arrive";
    case "cozy_contact": return "cozy_contact";
    case "cozy_curl": return "pet_purr";
    case "cozy_sigh": return "cozy_sigh";
    case "cozy_release": return "cozy_release";
    case "reveal": return "hatch_reveal";
    case "settled": return "hatch_settled";
    default: return null;
  }
}

/** Stable dedupe key: rAF may observe a marker late, but it must never sound twice. */
export function spriteAudioEventKey(event: SpriteAudioEvent) {
  return `${event.spriteToken}:${event.authoredFrame}:${event.type}`;
}
