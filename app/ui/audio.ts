"use client";

/**
 * Small synth voice bank. There are no audio files to download, nothing plays
 * before a real user gesture, and a blocked context degrades to silence.
 */
export type CueName =
  | "tap" | "pet" | "hold" | "leaf" | "eat" | "sleep" | "wake"
  | "blip" | "chime" | "hatch" | "evolve" | "reward" | "fail";

export type Channel = "effects" | "music" | "ambience";

let context: AudioContext | null = null;
let master: GainNode | null = null;
const volumes: Record<Channel, number> = { effects: 1, music: 0.5, ambience: 0.35 };

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    if (!master) {
      master = context.createGain();
      master.gain.value = 0.9;
      master.connect(context.destination);
    }
    return context;
  } catch {
    return null;
  }
}

export function setChannelVolume(channel: Channel, value: number) {
  volumes[channel] = Math.max(0, Math.min(1, value));
}

function voice(
  ctx: AudioContext, at: number, seconds: number,
  from: number, to: number, gainValue: number,
  type: OscillatorType = "sine", channel: Channel = "effects",
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + seconds);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainValue * volumes[channel]), at + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  osc.connect(gain).connect(master ?? ctx.destination);
  osc.start(at);
  osc.stop(at + seconds + 0.02);
}

const cues: Record<CueName, (ctx: AudioContext, at: number) => void> = {
  tap: (c, t) => { voice(c, t, 0.22, 340, 510, 0.11); voice(c, t + 0.035, 0.18, 690, 880, 0.035, "triangle"); },
  pet: (c, t) => { for (let i = 0; i < 4; i += 1) { const s = t + i * 0.075; voice(c, s, 0.13, 125 + i * 4, 118 + i * 4, 0.045, "triangle"); voice(c, s, 0.11, 250 + i * 8, 238 + i * 8, 0.018); } },
  hold: (c, t) => { voice(c, t, 0.65, 220, 196, 0.065); voice(c, t + 0.06, 0.58, 330, 294, 0.04); voice(c, t + 0.12, 0.5, 440, 392, 0.018, "triangle"); },
  leaf: (c, t) => { voice(c, t, 0.42, 920, 1380, 0.08); voice(c, t + 0.035, 0.5, 1380, 2070, 0.035); voice(c, t + 0.09, 0.42, 1840, 2300, 0.018, "triangle"); },
  eat: (c, t) => { voice(c, t, 0.11, 190, 145, 0.055, "triangle"); voice(c, t + 0.13, 0.12, 215, 160, 0.05, "triangle"); voice(c, t + 0.3, 0.28, 330, 520, 0.06); },
  sleep: (c, t) => { voice(c, t, 0.8, 392, 294, 0.045); voice(c, t + 0.12, 0.9, 294, 220, 0.035); voice(c, t + 0.25, 0.85, 196, 147, 0.025, "triangle"); },
  wake: (c, t) => { voice(c, t, 0.28, 294, 392, 0.045); voice(c, t + 0.18, 0.3, 392, 523, 0.055); voice(c, t + 0.38, 0.4, 523, 698, 0.035, "triangle"); },
  blip: (c, t) => voice(c, t, 0.09, 620, 760, 0.035),
  chime: (c, t) => { voice(c, t, 0.32, 523, 587, 0.05); voice(c, t + 0.11, 0.34, 659, 784, 0.045); voice(c, t + 0.24, 0.46, 880, 1046, 0.03, "triangle"); },
  hatch: (c, t) => { voice(c, t, 0.18, 180, 240, 0.05, "triangle"); voice(c, t + 0.22, 0.2, 240, 320, 0.05, "triangle"); voice(c, t + 0.5, 0.9, 392, 1046, 0.07); voice(c, t + 0.6, 0.8, 523, 1318, 0.04); },
  evolve: (c, t) => { [392, 494, 587, 784, 988].forEach((f, i) => voice(c, t + i * 0.12, 0.7, f, f * 1.5, 0.05)); },
  reward: (c, t) => { voice(c, t, 0.2, 659, 784, 0.05); voice(c, t + 0.1, 0.3, 880, 1046, 0.04); },
  fail: (c, t) => { voice(c, t, 0.24, 330, 220, 0.05, "triangle"); },
};

export function playCue(name: CueName) {
  const ctx = audio();
  if (!ctx) return;
  cues[name]?.(ctx, ctx.currentTime + 0.01);
}
