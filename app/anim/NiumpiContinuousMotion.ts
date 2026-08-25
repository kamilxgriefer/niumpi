import type { FrameClip } from "./NiumpiFrameMachine.ts";

export const CONTINUOUS_FPS = 60;

export const CONTINUOUS_DURATIONS: Record<FrameClip, number> = {
  idle: 6_000,
  blink: 520,
  look: 1_800,
  tap_reaction: 1_420,
  happy: 2_400,
  hatch_complete: 2_800,
};

export type MotionSample = {
  x: number;
  y: number;
  rotate: number;
  scaleX: number;
  scaleY: number;
  wobble: number;
  leaf: number;
  leftArm: number;
  rightArm: number;
  gazeX: number;
  gazeY: number;
  blink: number;
  smile: number;
  shadowScale: number;
  shadowAlpha: number;
  glow: number;
};

type Key = readonly [number, number];

const TAU = Math.PI * 2;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoother(value: number): number {
  const x = clamp01(value);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function track(position: number, keys: readonly Key[]): number {
  if (position <= keys[0][0]) return keys[0][1];
  for (let index = 1; index < keys.length; index += 1) {
    const previous = keys[index - 1];
    const next = keys[index];
    if (position <= next[0]) {
      const local = smoother((position - previous[0]) / Math.max(0.0001, next[0] - previous[0]));
      return previous[1] + (next[1] - previous[1]) * local;
    }
  }
  return keys[keys.length - 1][1];
}

function pulse(position: number, centre: number, width: number): number {
  const distance = Math.abs(position - centre);
  if (distance >= width) return 0;
  return 0.5 + 0.5 * Math.cos(Math.PI * distance / width);
}

function baseSample(): MotionSample {
  return {
    x: 0,
    y: 0,
    rotate: 0,
    scaleX: 1,
    scaleY: 1,
    wobble: 0.35,
    leaf: 0,
    leftArm: 0,
    rightArm: 0,
    gazeX: 0,
    gazeY: 0,
    blink: 0,
    smile: 0,
    shadowScale: 1,
    shadowAlpha: 0.23,
    glow: 0,
  };
}

function idleSample(position: number, behavior: string): MotionSample {
  const phase = position * TAU;
  const breath = Math.sin(phase * 2);
  const weight = Math.sin(phase);
  const secondary = Math.sin(phase * 3 + 0.7);
  const sample = baseSample();

  sample.x = weight * 0.012 + secondary * 0.0025;
  sample.y = -0.007 + Math.cos(phase * 2) * 0.007;
  sample.rotate = weight * 0.018 + secondary * 0.004;
  sample.scaleX = 1 + breath * 0.012;
  sample.scaleY = 1 - breath * 0.016;
  sample.wobble = 0.48 + 0.12 * Math.sin(phase * 2 + 1.2);
  sample.leaf = -weight * 0.34 + Math.sin(phase * 2 + 0.4) * 0.08;
  sample.leftArm = Math.sin(phase * 2 + 0.8) * 0.07;
  sample.rightArm = Math.sin(phase * 2 + 2.2) * 0.07;
  sample.gazeX = Math.sin(phase) * 0.7 + Math.sin(phase * 2) * 0.16;
  sample.gazeY = Math.cos(phase * 2) * 0.28;
  sample.blink = Math.max(pulse(position, 0.265, 0.025), pulse(position, 0.735, 0.023));
  sample.smile = 0.12 + 0.06 * Math.sin(phase * 2 + 0.3);
  sample.shadowScale = 1 + Math.cos(phase * 2) * 0.025;

  if (behavior === "walk") {
    const step = Math.sin(phase * 3);
    sample.y -= Math.abs(step) * 0.035;
    sample.rotate += step * 0.055;
    sample.scaleX += Math.abs(step) * 0.018;
    sample.scaleY -= Math.abs(step) * 0.025;
    sample.leftArm += step * 0.55;
    sample.rightArm -= step * 0.55;
    sample.leaf -= step * 0.4;
    sample.shadowScale -= Math.abs(step) * 0.1;
  } else if (behavior === "hover" || behavior === "float") {
    sample.y -= 0.11 + Math.sin(phase * 2) * 0.035;
    sample.rotate += Math.sin(phase) * 0.035;
    sample.leftArm += 0.28 + Math.sin(phase * 2) * 0.14;
    sample.rightArm += 0.28 - Math.sin(phase * 2) * 0.14;
    sample.shadowScale = 0.74 + Math.cos(phase * 2) * 0.04;
    sample.shadowAlpha = 0.13;
  } else if (behavior === "sleep" || behavior === "asleep" || behavior === "sleepy") {
    sample.y += 0.035;
    sample.rotate = -0.045 + Math.sin(phase) * 0.008;
    sample.scaleX = 1.025 + breath * 0.018;
    sample.scaleY = 0.965 - breath * 0.01;
    sample.blink = 1;
    sample.gazeX = 0;
    sample.gazeY = 0;
    sample.wobble = 0.18;
    sample.leaf = 0.22 + Math.sin(phase) * 0.04;
  } else if (behavior === "sad") {
    sample.y += 0.025;
    sample.rotate = -0.025;
    sample.scaleX = 1.02;
    sample.scaleY = 0.96;
    sample.gazeY = 0.72;
    sample.leaf = 0.28;
    sample.smile = -0.7;
  } else if (behavior === "read") {
    sample.x -= 0.018;
    sample.y += 0.012;
    sample.rotate -= 0.025 + Math.sin(phase) * 0.012;
    sample.gazeX = -0.34 + Math.sin(phase * 2) * 0.2;
    sample.gazeY = 0.62;
    sample.leftArm = 0.38 + Math.sin(phase) * 0.08;
    sample.rightArm = 0.38 - Math.sin(phase) * 0.08;
    sample.blink = Math.max(sample.blink, pulse(position, 0.52, 0.04));
    sample.wobble = 0.24;
  } else if (behavior === "lamp") {
    sample.x += 0.022;
    sample.y -= 0.012;
    sample.rotate += 0.035 + Math.sin(phase) * 0.014;
    sample.gazeX = 0.82;
    sample.gazeY = -0.34 + Math.cos(phase) * 0.1;
    sample.rightArm = 0.58 + Math.sin(phase) * 0.11;
    sample.leftArm = 0.08;
    sample.leaf = -0.3 + Math.sin(phase) * 0.08;
    sample.glow = 0.18 + 0.08 * Math.sin(phase);
  }

  return sample;
}

function blinkSample(position: number): MotionSample {
  const sample = idleSample(position * 0.14, "idle");
  sample.blink = Math.sin(Math.PI * position) ** 1.45;
  sample.scaleY -= sample.blink * 0.006;
  sample.scaleX += sample.blink * 0.004;
  return sample;
}

function lookSample(position: number): MotionSample {
  const sample = baseSample();
  sample.x = track(position, [[0, 0], [0.2, -0.025], [0.58, 0.032], [0.82, 0.032], [1, 0]]);
  sample.y = track(position, [[0, 0], [0.24, -0.018], [0.72, -0.018], [1, 0]]);
  sample.rotate = track(position, [[0, 0], [0.24, -0.065], [0.7, 0.045], [0.84, 0.045], [1, 0]]);
  sample.scaleX = 1 + track(position, [[0, 0], [0.22, 0.012], [0.72, 0.006], [1, 0]]);
  sample.scaleY = 1 - track(position, [[0, 0], [0.22, 0.015], [0.72, 0.006], [1, 0]]);
  sample.wobble = 0.44;
  sample.leaf = track(position, [[0, 0], [0.28, 0.58], [0.7, -0.42], [1, 0]]);
  sample.leftArm = track(position, [[0, 0], [0.3, 0.18], [0.78, 0.1], [1, 0]]);
  sample.rightArm = track(position, [[0, 0], [0.3, -0.08], [0.78, 0.22], [1, 0]]);
  sample.gazeX = track(position, [[0, 0], [0.18, -0.85], [0.46, -0.85], [0.64, 0.82], [0.88, 0.82], [1, 0]]);
  sample.gazeY = track(position, [[0, 0], [0.18, -0.5], [0.5, -0.5], [0.7, 0.18], [1, 0]]);
  sample.blink = pulse(position, 0.56, 0.055);
  sample.smile = 0.08;
  return sample;
}

function tapSample(position: number): MotionSample {
  const sample = baseSample();
  sample.x = track(position, [[0, 0], [0.11, -0.025], [0.28, 0.022], [0.48, 0.012], [0.72, -0.008], [1, 0]]);
  sample.y = track(position, [[0, 0], [0.12, 0.052], [0.3, -0.17], [0.48, -0.205], [0.72, 0.02], [0.84, -0.025], [1, 0]]);
  sample.rotate = track(position, [[0, 0], [0.12, -0.055], [0.3, 0.09], [0.5, -0.035], [0.72, 0.025], [1, 0]]);
  sample.scaleX = track(position, [[0, 1], [0.12, 1.09], [0.3, 0.94], [0.48, 0.97], [0.72, 1.055], [0.84, 0.985], [1, 1]]);
  sample.scaleY = track(position, [[0, 1], [0.12, 0.9], [0.3, 1.11], [0.48, 1.05], [0.72, 0.92], [0.84, 1.025], [1, 1]]);
  sample.wobble = 0.62 + pulse(position, 0.38, 0.28) * 0.55;
  sample.leaf = track(position, [[0, 0], [0.12, 0.7], [0.3, -1], [0.52, 0.72], [0.74, -0.42], [1, 0]]);
  sample.leftArm = track(position, [[0, 0], [0.13, -0.25], [0.32, 0.92], [0.58, 0.72], [0.78, -0.18], [1, 0]]);
  sample.rightArm = track(position, [[0, 0], [0.13, -0.18], [0.32, 0.86], [0.58, 0.78], [0.78, -0.12], [1, 0]]);
  sample.gazeY = track(position, [[0, 0], [0.2, -0.55], [0.58, -0.2], [0.82, 0.18], [1, 0]]);
  sample.blink = Math.max(pulse(position, 0.115, 0.065), pulse(position, 0.72, 0.055));
  sample.smile = track(position, [[0, 0], [0.22, 0.45], [0.72, 0.7], [1, 0.12]]);
  sample.shadowScale = track(position, [[0, 1], [0.12, 1.15], [0.42, 0.6], [0.72, 1.12], [1, 1]]);
  sample.shadowAlpha = track(position, [[0, 0.23], [0.42, 0.1], [0.72, 0.26], [1, 0.23]]);
  sample.glow = pulse(position, 0.48, 0.34);
  return sample;
}

function happySample(position: number, behavior: string): MotionSample {
  const sample = baseSample();
  const dance = behavior === "dance" || behavior === "dancing" || behavior === "sing" || behavior === "singing";
  const roll = behavior === "roll";
  sample.x = track(position, [[0, 0], [0.14, -0.035], [0.3, 0.04], [0.46, -0.045], [0.62, 0.04], [0.8, -0.024], [1, 0]]);
  sample.y = track(position, [[0, 0], [0.1, 0.035], [0.22, -0.12], [0.34, 0.012], [0.48, -0.145], [0.62, 0.018], [0.76, -0.105], [0.9, 0.014], [1, 0]]);
  sample.rotate = track(position, [[0, 0], [0.15, -0.08], [0.3, 0.11], [0.46, -0.12], [0.62, 0.12], [0.78, -0.075], [1, 0]]);
  sample.scaleX = track(position, [[0, 1], [0.1, 1.06], [0.22, 0.96], [0.34, 1.04], [0.48, 0.96], [0.62, 1.04], [0.76, 0.97], [0.9, 1.025], [1, 1]]);
  sample.scaleY = track(position, [[0, 1], [0.1, 0.93], [0.22, 1.08], [0.34, 0.94], [0.48, 1.09], [0.62, 0.94], [0.76, 1.07], [0.9, 0.975], [1, 1]]);
  sample.wobble = 0.72 + Math.sin(position * TAU * 3) * 0.18;
  sample.leaf = track(position, [[0, 0], [0.16, 0.85], [0.3, -0.9], [0.46, 0.94], [0.62, -0.82], [0.78, 0.58], [1, 0]]);
  sample.leftArm = track(position, [[0, 0], [0.14, 0.84], [0.3, -0.35], [0.46, 0.94], [0.62, -0.22], [0.78, 0.72], [1, 0]]);
  sample.rightArm = track(position, [[0, 0], [0.14, -0.22], [0.3, 0.92], [0.46, -0.28], [0.62, 0.96], [0.78, 0.46], [1, 0]]);
  sample.gazeX = Math.sin(position * TAU * 2) * 0.34;
  sample.gazeY = -0.25;
  sample.blink = Math.max(pulse(position, 0.36, 0.05), pulse(position, 0.87, 0.048));
  sample.smile = 0.82;
  sample.shadowScale = 1 + sample.y * 1.6;
  sample.shadowAlpha = 0.2;
  sample.glow = 0.35 + 0.35 * Math.sin(position * Math.PI);

  if (dance) {
    const rhythm = Math.sin(position * TAU * 4);
    sample.x += rhythm * 0.028;
    sample.rotate += rhythm * 0.055;
    sample.leftArm += rhythm * 0.35;
    sample.rightArm -= rhythm * 0.35;
  }
  if (roll) {
    sample.rotate += track(position, [[0, 0], [0.18, -0.18], [0.48, 0.32], [0.7, -0.14], [1, 0]]);
    sample.scaleX += pulse(position, 0.5, 0.35) * 0.08;
    sample.scaleY -= pulse(position, 0.5, 0.35) * 0.08;
  }
  return sample;
}

function hatchSample(position: number): MotionSample {
  const sample = baseSample();
  sample.x = track(position, [[0, 0], [0.18, -0.02], [0.34, 0.025], [0.58, -0.016], [1, 0]]);
  sample.y = track(position, [[0, 0.17], [0.12, 0.08], [0.26, -0.18], [0.44, 0.025], [0.58, -0.09], [0.76, 0.012], [1, 0]]);
  sample.rotate = track(position, [[0, -0.06], [0.18, 0.08], [0.36, -0.075], [0.56, 0.055], [0.78, -0.02], [1, 0]]);
  sample.scaleX = track(position, [[0, 0.72], [0.12, 1.08], [0.26, 0.92], [0.44, 1.06], [0.58, 0.97], [0.76, 1.02], [1, 1]]);
  sample.scaleY = track(position, [[0, 0.54], [0.12, 0.88], [0.26, 1.13], [0.44, 0.93], [0.58, 1.05], [0.76, 0.985], [1, 1]]);
  sample.wobble = track(position, [[0, 0.12], [0.2, 1.05], [0.58, 0.68], [1, 0.45]]);
  sample.leaf = track(position, [[0, 0.7], [0.2, -1], [0.38, 0.9], [0.56, -0.62], [0.78, 0.26], [1, 0]]);
  sample.leftArm = track(position, [[0, -0.2], [0.22, 0.94], [0.48, 0.55], [0.72, -0.1], [1, 0]]);
  sample.rightArm = track(position, [[0, -0.2], [0.22, 0.94], [0.48, 0.55], [0.72, -0.1], [1, 0]]);
  sample.gazeY = track(position, [[0, 0.45], [0.22, -0.55], [0.58, -0.12], [1, 0]]);
  sample.blink = Math.max(1 - smoother(position / 0.16), pulse(position, 0.47, 0.055));
  sample.smile = track(position, [[0, -0.1], [0.22, 0.2], [0.48, 0.86], [1, 0.25]]);
  sample.shadowScale = track(position, [[0, 0.72], [0.26, 0.58], [0.44, 1.12], [1, 1]]);
  sample.shadowAlpha = track(position, [[0, 0], [0.12, 0.08], [0.44, 0.27], [1, 0.23]]);
  sample.glow = track(position, [[0, 1], [0.2, 0.82], [0.58, 0.42], [1, 0]]);
  return sample;
}

export function motionPosition(clip: FrameClip, elapsedMs: number): number {
  const duration = CONTINUOUS_DURATIONS[clip];
  const safe = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  return clip === "idle"
    ? (safe % duration) / duration
    : Math.min(1, safe / duration);
}

export function motionFrameAtTime(clip: FrameClip, elapsedMs: number): number {
  const duration = CONTINUOUS_DURATIONS[clip];
  const total = Math.max(1, Math.round(duration / 1_000 * CONTINUOUS_FPS));
  const safe = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  const frame = Math.floor(safe / 1_000 * CONTINUOUS_FPS + 0.000001);
  return clip === "idle" ? frame % total : Math.min(total - 1, frame);
}

export function sampleContinuousMotion(clip: FrameClip, elapsedMs: number, behavior: string = clip): MotionSample {
  const behaviorCycle: Partial<Record<string, number>> = {
    walk: 920,
    hover: 2_200,
    float: 2_200,
    sleep: 6_000,
    asleep: 6_000,
    sleepy: 4_200,
    sad: 4_200,
    read: 3_800,
    lamp: 2_600,
  };
  const cycle = clip === "idle" ? behaviorCycle[behavior] : undefined;
  const position = cycle
    ? (Math.max(0, elapsedMs) % cycle) / cycle
    : motionPosition(clip, elapsedMs);
  if (clip === "blink") return blinkSample(position);
  if (clip === "look") return lookSample(position);
  if (clip === "tap_reaction") return tapSample(position);
  if (clip === "happy") return happySample(position, behavior);
  if (clip === "hatch_complete") return hatchSample(position);
  return idleSample(position, behavior);
}
