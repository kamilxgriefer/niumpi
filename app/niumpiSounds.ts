type SoundKind = "tap" | "pet" | "hold" | "leaf" | "eat" | "sleep" | "wake" | "blip" | "chime";

let audioContext: AudioContext | null = null;

/** Audio is a bonus, never a requirement: a blocked context must not break play. */
function safeContext() {
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === "suspended") void audioContext.resume();
    return audioContext;
  } catch {
    return null;
  }
}

function voice(
  audio: AudioContext,
  start: number,
  duration: number,
  frequency: number,
  endFrequency: number,
  volume: number,
  type: OscillatorType = "sine",
) {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function tapSound(audio: AudioContext, now: number) {
  voice(audio, now, 0.22, 340, 510, 0.11, "sine");
  voice(audio, now + 0.035, 0.18, 690, 880, 0.035, "triangle");
}

function petSound(audio: AudioContext, now: number) {
  for (let pulse = 0; pulse < 4; pulse += 1) {
    const start = now + pulse * 0.075;
    voice(audio, start, 0.13, 125 + pulse * 4, 118 + pulse * 4, 0.045, "triangle");
    voice(audio, start, 0.11, 250 + pulse * 8, 238 + pulse * 8, 0.018, "sine");
  }
}

function holdSound(audio: AudioContext, now: number) {
  voice(audio, now, 0.65, 220, 196, 0.065, "sine");
  voice(audio, now + 0.06, 0.58, 330, 294, 0.04, "sine");
  voice(audio, now + 0.12, 0.5, 440, 392, 0.018, "triangle");
}

function leafSound(audio: AudioContext, now: number) {
  voice(audio, now, 0.42, 920, 1380, 0.08, "sine");
  voice(audio, now + 0.035, 0.5, 1380, 2070, 0.035, "sine");
  voice(audio, now + 0.09, 0.42, 1840, 2300, 0.018, "triangle");
}

function eatSound(audio: AudioContext, now: number) {
  voice(audio, now, 0.11, 190, 145, 0.055, "triangle");
  voice(audio, now + 0.13, 0.12, 215, 160, 0.05, "triangle");
  voice(audio, now + 0.3, 0.28, 330, 520, 0.06, "sine");
  voice(audio, now + 0.34, 0.24, 660, 820, 0.025, "triangle");
}

function sleepSound(audio: AudioContext, now: number) {
  voice(audio, now, 0.8, 392, 294, 0.045, "sine");
  voice(audio, now + 0.12, 0.9, 294, 220, 0.035, "sine");
  voice(audio, now + 0.25, 0.85, 196, 147, 0.025, "triangle");
}

function wakeSound(audio: AudioContext, now: number) {
  voice(audio, now, 0.28, 294, 392, 0.045, "sine");
  voice(audio, now + 0.18, 0.3, 392, 523, 0.055, "sine");
  voice(audio, now + 0.38, 0.4, 523, 698, 0.035, "triangle");
}

function blipSound(audio: AudioContext, now: number) {
  voice(audio, now, 0.09, 620, 760, 0.035, "sine");
}

function chimeSound(audio: AudioContext, now: number) {
  voice(audio, now, 0.32, 523, 587, 0.05, "sine");
  voice(audio, now + 0.11, 0.34, 659, 784, 0.045, "sine");
  voice(audio, now + 0.24, 0.46, 880, 1046, 0.03, "triangle");
}

export function playNiumpiSound(kind: SoundKind) {
  const audio = safeContext();
  if (!audio) return;
  const now = audio.currentTime + 0.01;
  if (kind === "tap") tapSound(audio, now);
  if (kind === "pet") petSound(audio, now);
  if (kind === "hold") holdSound(audio, now);
  if (kind === "leaf") leafSound(audio, now);
  if (kind === "eat") eatSound(audio, now);
  if (kind === "sleep") sleepSound(audio, now);
  if (kind === "wake") wakeSound(audio, now);
  if (kind === "blip") blipSound(audio, now);
  if (kind === "chime") chimeSound(audio, now);
}
