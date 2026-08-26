"use client";

import {
  ambienceIds,
  assetForSpriteEvent,
  mixForSoundscape,
  musicStemIds,
  spriteAudioEventKey,
} from "./director.ts";
import type {
  AmbienceId,
  AudioAssetId,
  MusicStemId,
  SoundscapeMix,
  SoundscapeState,
  SpriteAudioEvent,
} from "./director.ts";

export type AudioChannel = "effects" | "music" | "ambience";
export type AudioRuntimeState = "locked" | "unlocking" | "running" | "suspended" | "degraded" | "unavailable";

type AudioSourceDescription = { src: string; type: string };

type AudioAssetDescription = {
  id: AudioAssetId;
  category: "music" | "ambience" | "effects";
  durationSeconds: number;
  loop: boolean;
  loopStartSeconds?: number;
  loopEndSeconds?: number;
  gain: number;
  cooldownMs?: number;
  polyphony?: number;
  rateVariance?: number;
  reverb?: number;
  sources: AudioSourceDescription[];
};

type AudioManifest = {
  version: number;
  sampleRate: number;
  assets: Partial<Record<AudioAssetId, AudioAssetDescription>>;
};

type AudioGraph = {
  context: AudioContext;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  effects: GainNode;
  music: GainNode;
  ambience: GainNode;
  preview: GainNode;
  duck: GainNode;
  lowpass: BiquadFilterNode;
  convolver: ConvolverNode;
  reverbReturn: GainNode;
};

type LoopVoice = {
  id: MusicStemId | AmbienceId;
  source: AudioBufferSourceNode;
  gain: GainNode;
  baseGain: number;
  target: number;
};

type EffectVoice = {
  id: AudioAssetId;
  source: AudioBufferSourceNode;
  nodes: AudioNode[];
  startedAt: number;
  priority: number;
};

export type PlayAssetOptions = {
  force?: boolean;
  gain?: number;
  pan?: number;
  priority?: number;
  source?: "ui" | "action" | "animation" | "system";
  dedupeKey?: string;
};

export type AudioRuntimeSnapshot = {
  state: AudioRuntimeState;
  contextState: AudioContextState | "none";
  activeVoices: number;
  activeLoops: number;
  decodedBuffers: number;
  cueCount: number;
  dedupedCount: number;
  droppedCount: number;
};

const MANIFEST_URL = "/audio/niumpi-v1/manifest.json";
const MAX_EFFECT_VOICES = 14;
const MAX_DECODED_BUFFERS = 36;
const EPSILON = 0.0001;

const defaultSoundscape: SoundscapeState = {
  scene: "home",
  stage: 1,
  route: null,
  mood: "happy",
  weather: "sunny",
  sleeping: false,
  lampOn: true,
  musicEnabled: false,
  effectsEnabled: false,
  lowPower: false,
};

const defaultVolumes: Record<AudioChannel, number> = {
  effects: 0.88,
  music: 0.54,
  ambience: 0.34,
};

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateManifest(value: unknown): AudioManifest {
  if (!value || typeof value !== "object") throw new Error("audio-manifest-shape");
  const candidate = value as { version?: unknown; sampleRate?: unknown; assets?: unknown };
  if (candidate.version !== 1 || !isFiniteNumber(candidate.sampleRate) || !candidate.assets || typeof candidate.assets !== "object") {
    throw new Error("audio-manifest-version");
  }
  const assets: Partial<Record<AudioAssetId, AudioAssetDescription>> = {};
  for (const [key, raw] of Object.entries(candidate.assets)) {
    if (!raw || typeof raw !== "object") continue;
    const asset = raw as Partial<AudioAssetDescription>;
    if (
      asset.id !== key
      || !["music", "ambience", "effects"].includes(String(asset.category))
      || !isFiniteNumber(asset.durationSeconds)
      || typeof asset.loop !== "boolean"
      || !isFiniteNumber(asset.gain)
      || !Array.isArray(asset.sources)
      || asset.sources.length === 0
      || asset.sources.some((source) => !source || typeof source.src !== "string" || typeof source.type !== "string")
    ) continue;
    assets[key as AudioAssetId] = asset as AudioAssetDescription;
  }
  if (!musicStemIds.every((id) => assets[id])) throw new Error("audio-manifest-music");
  return { version: 1, sampleRate: candidate.sampleRate, assets };
}

function createImpulse(context: AudioContext) {
  const seconds = 1.25;
  const length = Math.ceil(context.sampleRate * seconds);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      // Deterministic velvet-noise style tail. No asset, timer or Math.random.
      const hash = Math.sin((index + 1) * (channel + 1) * 12.9898) * 43_758.5453;
      const noise = (hash - Math.floor(hash)) * 2 - 1;
      data[index] = noise * Math.pow(1 - index / length, 3.8) * 0.34;
    }
  }
  return impulse;
}

function createGraph(context: AudioContext): AudioGraph {
  const master = context.createGain();
  const limiter = context.createDynamicsCompressor();
  const effects = context.createGain();
  const music = context.createGain();
  const ambience = context.createGain();
  const preview = context.createGain();
  const duck = context.createGain();
  const lowpass = context.createBiquadFilter();
  const convolver = context.createConvolver();
  const reverbReturn = context.createGain();

  master.gain.value = 0.9;
  effects.gain.value = 0;
  music.gain.value = defaultVolumes.music;
  ambience.gain.value = defaultVolumes.ambience;
  preview.gain.value = 0.78;
  duck.gain.value = 1;
  lowpass.type = "lowpass";
  lowpass.frequency.value = 12_000;
  lowpass.Q.value = 0.38;
  limiter.threshold.value = -5;
  limiter.knee.value = 7;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.18;
  convolver.buffer = createImpulse(context);
  reverbReturn.gain.value = 0.22;

  effects.connect(master);
  preview.connect(master);
  music.connect(duck);
  duck.connect(lowpass);
  lowpass.connect(master);
  ambience.connect(master);
  convolver.connect(reverbReturn);
  reverbReturn.connect(master);
  master.connect(limiter);
  limiter.connect(context.destination);

  return { context, master, limiter, effects, music, ambience, preview, duck, lowpass, convolver, reverbReturn };
}

function priorityFor(id: AudioAssetId) {
  if (id === "evolve_rise" || id === "loot_legendary" || id === "hatch_reveal") return 4;
  if (id === "ui_reward" || id === "loot_rare" || id === "happy_peak") return 3;
  if (id.startsWith("bite_") || id === "swallow" || id.startsWith("sing_")) return 2;
  return 1;
}

/**
 * A single session-long native Web Audio director. It owns the graph and the
 * musical clock; React only supplies semantic world state and authored frame
 * events. Missing or unsupported audio always degrades silently.
 */
export class NiumpiAudioDirector {
  private graph: AudioGraph | null = null;
  private runtimeState: AudioRuntimeState = "locked";
  private manifestPromise: Promise<AudioManifest> | null = null;
  private buffers = new Map<AudioAssetId, Promise<AudioBuffer>>();
  private bufferOrder: AudioAssetId[] = [];
  private loops = new Map<MusicStemId | AmbienceId, LoopVoice>();
  private effects = new Set<EffectVoice>();
  private effectsByAsset = new Map<AudioAssetId, EffectVoice[]>();
  private lastPlayedAt = new Map<AudioAssetId, number>();
  private desired: SoundscapeState = defaultSoundscape;
  private mix: SoundscapeMix = mixForSoundscape(defaultSoundscape);
  private volumes = { ...defaultVolumes };
  private musicEpoch: number | null = null;
  private unlockPromise: Promise<boolean> | null = null;
  private mounted = 0;
  private unmountListeners: (() => void) | null = null;
  private resumeAfterVisibility = false;
  private presentationKeys = new Set<string>();
  private presentationOrder: string[] = [];
  private cueCounter = 0;
  private dedupedCounter = 0;
  private droppedCounter = 0;
  private rateCounter = 0;
  private failed = false;

  snapshot(): AudioRuntimeSnapshot {
    return {
      state: this.runtimeState,
      contextState: this.graph?.context.state ?? "none",
      activeVoices: this.effects.size,
      activeLoops: this.loops.size,
      decodedBuffers: this.buffers.size,
      cueCount: this.cueCounter,
      dedupedCount: this.dedupedCounter,
      droppedCount: this.droppedCounter,
    };
  }

  mount() {
    this.mounted += 1;
    if (this.unmountListeners || typeof document === "undefined") return () => this.unmount();

    const unlock = (event: Event) => {
      if ("isTrusted" in event && !event.isTrusted) return;
      void this.unlock(true);
    };
    const presentation = (event: Event) => this.handlePresentationEvent(event);
    const visibility = () => void this.handleVisibility();
    const pageHide = () => void this.suspend("pagehide");
    document.addEventListener("pointerdown", unlock, { capture: true });
    document.addEventListener("keydown", unlock, { capture: true });
    document.addEventListener("niumpi:presentation-event", presentation);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pageHide);
    this.unmountListeners = () => {
      document.removeEventListener("pointerdown", unlock, { capture: true });
      document.removeEventListener("keydown", unlock, { capture: true });
      document.removeEventListener("niumpi:presentation-event", presentation);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pageHide);
      this.unmountListeners = null;
    };
    this.publishTelemetry();
    return () => this.unmount();
  }

  private unmount() {
    this.mounted = Math.max(0, this.mounted - 1);
    if (this.mounted === 0) this.unmountListeners?.();
  }

  async unlock(trustedGesture = false) {
    if (!trustedGesture || typeof window === "undefined") {
      this.drop("gesture-required");
      return false;
    }
    if (this.graph?.context.state === "running") return true;
    if (this.unlockPromise) return this.unlockPromise;

    this.runtimeState = "unlocking";
    this.publishTelemetry();
    this.unlockPromise = (async () => {
      try {
        if (!this.graph) {
          const AudioContextCtor = window.AudioContext
            ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!AudioContextCtor) {
            this.runtimeState = "unavailable";
            this.publishTelemetry("audio-context-unavailable");
            return false;
          }
          this.graph = createGraph(new AudioContextCtor({ latencyHint: "interactive" }));
        }
        await this.graph.context.resume();
        if (this.graph.context.state !== "running") throw new Error("audio-context-blocked");
        this.runtimeState = "running";
        this.failed = false;
        this.applyChannelGains(0.04);
        void this.applySoundscape();
        this.publishTelemetry();
        return true;
      } catch (error) {
        this.runtimeState = "degraded";
        this.publishTelemetry(error instanceof Error ? error.message : "audio-unlock-failed");
        return false;
      } finally {
        this.unlockPromise = null;
      }
    })();
    return this.unlockPromise;
  }

  configure(next: SoundscapeState) {
    this.desired = next;
    this.mix = mixForSoundscape(next);
    this.applyChannelGains(0.08);
    if (this.graph?.context.state === "running") void this.applySoundscape();
    this.publishTelemetry();
  }

  setChannelVolume(channel: AudioChannel, volume: number) {
    this.volumes[channel] = clamp(volume);
    this.applyChannelGains(0.08);
    this.publishTelemetry();
  }

  async play(id: AudioAssetId, options: PlayAssetOptions = {}) {
    if (options.dedupeKey && this.presentationKeys.has(options.dedupeKey)) {
      this.dedupedCounter += 1;
      this.emitCue("deduped", id, options);
      return false;
    }
    // Reserve authored markers before any asynchronous decode. Two rAF/event
    // consumers can race while the first WAV is loading; only one may sound.
    if (options.dedupeKey) this.rememberPresentationKey(options.dedupeKey);
    if (!options.force && !this.desired.effectsEnabled) {
      this.drop("effects-muted", id, options);
      return false;
    }
    if (!this.graph || (this.graph.context.state !== "running" && !this.unlockPromise)) {
      this.drop("audio-locked", id, options);
      return false;
    }
    if (this.unlockPromise && !(await this.unlockPromise)) return false;
    const graph = this.graph;
    if (!graph || graph.context.state !== "running") return false;

    try {
      const manifest = await this.loadManifest();
      const asset = manifest.assets[id];
      if (!asset) throw new Error(`audio-asset-missing:${id}`);
      const nowMs = performance.now();
      const cooldown = Math.max(0, asset.cooldownMs ?? 0);
      if (!options.force && nowMs - (this.lastPlayedAt.get(id) ?? -Infinity) < cooldown) {
        this.drop("cooldown", id, options);
        return false;
      }
      if (!options.force && !this.desired.effectsEnabled) return false;
      const buffer = await this.loadBuffer(id, asset);
      if (!options.force && !this.desired.effectsEnabled) return false;
      this.lastPlayedAt.set(id, nowMs);
      this.startEffectVoice(asset, buffer, options);
      return true;
    } catch (error) {
      this.failed = true;
      this.runtimeState = "degraded";
      this.drop(error instanceof Error ? error.message : "audio-play-failed", id, options);
      return false;
    }
  }

  private startEffectVoice(asset: AudioAssetDescription, buffer: AudioBuffer, options: PlayAssetOptions) {
    const graph = this.graph;
    if (!graph) return;
    const context = graph.context;
    const perAsset = this.effectsByAsset.get(asset.id) ?? [];
    const polyphony = Math.max(1, Math.min(8, asset.polyphony ?? 2));
    while (perAsset.length >= polyphony) this.stopVoice(perAsset.shift());
    while (this.effects.size >= MAX_EFFECT_VOICES) {
      const victim = [...this.effects].sort((a, b) => a.priority - b.priority || a.startedAt - b.startedAt)[0];
      this.stopVoice(victim);
    }

    const source = context.createBufferSource();
    const gain = context.createGain();
    const pan = typeof context.createStereoPanner === "function" ? context.createStereoPanner() : null;
    const dryOutput = options.force ? graph.preview : graph.effects;
    const voiceGain = clamp(asset.gain * (options.gain ?? 1), 0, 1.4);
    gain.gain.value = voiceGain;
    if (pan) pan.pan.value = clamp(options.pan ?? 0, -1, 1);
    this.rateCounter += 1;
    const signed = ((this.rateCounter * 17) % 23) / 11 - 1;
    source.playbackRate.value = 1 + signed * clamp(asset.rateVariance ?? 0, 0, 0.12);
    source.buffer = buffer;
    source.connect(gain);
    if (pan) {
      gain.connect(pan);
      pan.connect(dryOutput);
    } else gain.connect(dryOutput);

    const nodes: AudioNode[] = [gain];
    if (pan) nodes.push(pan);
    const reverbAmount = this.desired.lowPower ? 0 : clamp(asset.reverb ?? 0, 0, 0.5);
    if (reverbAmount > 0) {
      const send = context.createGain();
      send.gain.value = reverbAmount;
      (pan ?? gain).connect(send);
      send.connect(graph.convolver);
      nodes.push(send);
    }

    const voice: EffectVoice = {
      id: asset.id,
      source,
      nodes,
      startedAt: context.currentTime,
      priority: options.priority ?? priorityFor(asset.id),
    };
    this.effects.add(voice);
    perAsset.push(voice);
    this.effectsByAsset.set(asset.id, perAsset);
    source.onended = () => this.finishVoice(voice);
    source.start();
    this.cueCounter += 1;
    this.emitCue("scheduled", asset.id, options);
    if (["happy_peak", "ui_reward", "evolve_rise", "loot_rare", "loot_legendary"].includes(asset.id)) {
      this.duckMusic(asset.id === "evolve_rise" || asset.id === "loot_legendary" ? 0.52 : 0.68);
    }
    this.publishTelemetry();
  }

  private finishVoice(voice: EffectVoice) {
    if (!this.effects.delete(voice)) return;
    const list = this.effectsByAsset.get(voice.id)?.filter((entry) => entry !== voice) ?? [];
    if (list.length) this.effectsByAsset.set(voice.id, list);
    else this.effectsByAsset.delete(voice.id);
    voice.source.disconnect();
    voice.nodes.forEach((node) => node.disconnect());
    this.publishTelemetry();
  }

  private stopVoice(voice: EffectVoice | undefined) {
    if (!voice) return;
    try { voice.source.stop(); } catch { this.finishVoice(voice); }
  }

  private duckMusic(target: number) {
    const graph = this.graph;
    if (!graph) return;
    const at = graph.context.currentTime;
    const gain = graph.duck.gain;
    gain.cancelScheduledValues(at);
    gain.setValueAtTime(gain.value, at);
    gain.linearRampToValueAtTime(target, at + 0.035);
    gain.exponentialRampToValueAtTime(1, at + 0.52);
  }

  private async applySoundscape() {
    const graph = this.graph;
    if (!graph || graph.context.state !== "running") return;
    const mix = this.mix;
    const at = graph.context.currentTime;
    graph.lowpass.frequency.cancelScheduledValues(at);
    graph.lowpass.frequency.setValueAtTime(Math.max(120, graph.lowpass.frequency.value), at);
    graph.lowpass.frequency.exponentialRampToValueAtTime(Math.max(120, mix.lowpassHz), at + mix.transitionSeconds);

    const wanted = [
      ...musicStemIds.filter((id) => mix.stems[id] > 0),
      ...ambienceIds.filter((id) => mix.ambience[id] > 0),
    ];
    await Promise.allSettled(wanted.map((id) => this.ensureLoop(id)));
    if (!this.graph || this.graph !== graph) return;

    for (const id of musicStemIds) this.rampLoop(id, mix.stems[id], mix.transitionSeconds);
    for (const id of ambienceIds) this.rampLoop(id, mix.ambience[id], mix.transitionSeconds);
    this.publishTelemetry();
  }

  private async ensureLoop(id: MusicStemId | AmbienceId) {
    if (this.loops.has(id)) return;
    const graph = this.graph;
    if (!graph) return;
    const manifest = await this.loadManifest();
    const asset = manifest.assets[id];
    if (!asset) throw new Error(`audio-loop-missing:${id}`);
    const buffer = await this.loadBuffer(id, asset);
    if (!this.graph || this.graph !== graph || this.loops.has(id)) return;
    const source = graph.context.createBufferSource();
    const gain = graph.context.createGain();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = asset.loopStartSeconds ?? 0;
    source.loopEnd = asset.loopEndSeconds ?? buffer.duration;
    gain.gain.value = EPSILON;
    source.connect(gain);
    gain.connect(asset.category === "music" ? graph.music : graph.ambience);
    const duration = Math.max(0.1, source.loopEnd - source.loopStart);
    if (asset.category === "music" && this.musicEpoch === null) this.musicEpoch = graph.context.currentTime;
    const epoch = asset.category === "music" ? (this.musicEpoch ?? graph.context.currentTime) : graph.context.currentTime;
    const offset = source.loopStart + ((graph.context.currentTime - epoch) % duration + duration) % duration;
    source.start(0, offset);
    source.onended = () => {
      gain.disconnect();
      if (this.loops.get(id)?.source === source) this.loops.delete(id);
    };
    this.loops.set(id, { id, source, gain, baseGain: clamp(asset.gain, 0, 1.2), target: 0 });
  }

  private rampLoop(id: MusicStemId | AmbienceId, target: number, seconds: number) {
    const voice = this.loops.get(id);
    if (!voice || !this.graph) return;
    const assetGain = target * voice.baseGain;
    const at = this.graph.context.currentTime;
    voice.target = assetGain;
    voice.gain.gain.cancelScheduledValues(at);
    voice.gain.gain.setValueAtTime(Math.max(EPSILON, voice.gain.gain.value), at);
    voice.gain.gain.exponentialRampToValueAtTime(Math.max(EPSILON, assetGain), at + Math.max(0.05, seconds));
  }

  private applyChannelGains(seconds: number) {
    const graph = this.graph;
    if (!graph) return;
    const at = graph.context.currentTime;
    const targets: Array<[GainNode, number]> = [
      [graph.effects, this.desired.effectsEnabled ? this.volumes.effects : 0],
      [graph.music, this.desired.musicEnabled ? this.volumes.music : 0],
      [graph.ambience, this.desired.musicEnabled ? this.volumes.ambience : 0],
    ];
    for (const [node, target] of targets) {
      node.gain.cancelScheduledValues(at);
      node.gain.setValueAtTime(node.gain.value, at);
      node.gain.linearRampToValueAtTime(target, at + seconds);
    }
  }

  private async loadManifest() {
    if (!this.manifestPromise) {
      this.manifestPromise = fetch(MANIFEST_URL, { cache: "force-cache" })
        .then((response) => {
          if (!response.ok) throw new Error(`audio-manifest-http-${response.status}`);
          return response.json() as Promise<unknown>;
        })
        .then(validateManifest)
        .catch((error) => {
          this.manifestPromise = null;
          throw error;
        });
    }
    return this.manifestPromise;
  }

  private loadBuffer(id: AudioAssetId, asset: AudioAssetDescription) {
    const existing = this.buffers.get(id);
    if (existing) return existing;
    const graph = this.graph;
    if (!graph) return Promise.reject(new Error("audio-context-missing"));
    const source = this.chooseSource(asset.sources);
    if (!source) return Promise.reject(new Error(`audio-format-unsupported:${id}`));
    const request = fetch(source.src, { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`audio-http-${response.status}:${id}`);
        return response.arrayBuffer();
      })
      .then((data) => graph.context.decodeAudioData(data.slice(0)))
      .then((buffer) => {
        this.touchBuffer(id);
        return buffer;
      })
      .catch((error) => {
        this.buffers.delete(id);
        this.bufferOrder = this.bufferOrder.filter((entry) => entry !== id);
        throw error;
      });
    this.buffers.set(id, request);
    return request;
  }

  private chooseSource(sources: AudioSourceDescription[]) {
    if (typeof document === "undefined") return sources[0] ?? null;
    const probe = document.createElement("audio");
    return sources.find((source) => probe.canPlayType(source.type) !== "") ?? null;
  }

  private touchBuffer(id: AudioAssetId) {
    this.bufferOrder = [...this.bufferOrder.filter((entry) => entry !== id), id];
    while (this.bufferOrder.length > MAX_DECODED_BUFFERS) {
      const candidate = this.bufferOrder.shift();
      if (!candidate || this.loops.has(candidate as MusicStemId | AmbienceId)) continue;
      this.buffers.delete(candidate);
    }
  }

  private handlePresentationEvent(event: Event) {
    const custom = event as CustomEvent<SpriteAudioEvent>;
    const detail = custom.detail;
    if (!detail || detail.synthetic) return;
    const target = event.target;
    if (target instanceof Element) {
      if (target.closest("[data-animation-lab], .animation-lab")) return;
      if (!target.closest(".rig-root")) return;
    }
    const asset = assetForSpriteEvent(detail);
    if (!asset) return;
    const key = spriteAudioEventKey(detail);
    void this.play(asset, { source: "animation", dedupeKey: key, priority: priorityFor(asset) });
  }

  private rememberPresentationKey(key: string) {
    if (this.presentationKeys.has(key)) return;
    this.presentationKeys.add(key);
    this.presentationOrder.push(key);
    while (this.presentationOrder.length > 256) {
      const stale = this.presentationOrder.shift();
      if (stale) this.presentationKeys.delete(stale);
    }
  }

  private async handleVisibility() {
    if (document.visibilityState === "hidden") await this.suspend("hidden");
    else if (this.resumeAfterVisibility) await this.resume();
  }

  private async suspend(reason: "hidden" | "pagehide") {
    const graph = this.graph;
    if (!graph || graph.context.state !== "running") return;
    this.resumeAfterVisibility = true;
    if (typeof document !== "undefined") document.documentElement.dataset.audioSuspendReason = reason;
    try {
      await graph.context.suspend();
      this.runtimeState = "suspended";
      this.publishTelemetry();
    } catch {
      this.publishTelemetry("audio-suspend-failed");
    }
  }

  private async resume() {
    const graph = this.graph;
    if (!graph || !this.resumeAfterVisibility) return;
    try {
      await graph.context.resume();
      this.resumeAfterVisibility = false;
      this.runtimeState = graph.context.state === "running" ? "running" : "degraded";
      this.publishTelemetry();
    } catch {
      this.runtimeState = "degraded";
      this.publishTelemetry("audio-resume-failed");
    }
  }

  private emitCue(status: "scheduled" | "deduped" | "dropped", id: AudioAssetId, options: PlayAssetOptions) {
    if (typeof document === "undefined") return;
    document.documentElement.dataset.audioLastCue = id;
    document.documentElement.dataset.audioLastSource = options.source ?? "unknown";
    document.dispatchEvent(new CustomEvent("niumpi:audio-cue", {
      detail: { status, id, source: options.source ?? "unknown", key: options.dedupeKey ?? "" },
    }));
  }

  private drop(code: string, id?: AudioAssetId, options: PlayAssetOptions = {}) {
    this.droppedCounter += 1;
    if (id) this.emitCue("dropped", id, options);
    this.publishTelemetry(code);
  }

  private publishTelemetry(errorCode = "") {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.dataset.audioEngine = "webaudio-v1";
    root.dataset.audioState = this.runtimeState;
    root.dataset.audioContextState = this.graph?.context.state ?? "none";
    root.dataset.audioMaster = String(this.desired.musicEnabled || this.desired.effectsEnabled);
    root.dataset.audioEffects = String(this.desired.effectsEnabled);
    root.dataset.audioMusic = String(this.desired.musicEnabled);
    root.dataset.audioActiveVoices = String(this.effects.size);
    root.dataset.audioMaxVoices = String(MAX_EFFECT_VOICES);
    root.dataset.audioLoops = String(this.loops.size);
    root.dataset.audioDecodedBuffers = String(this.buffers.size);
    root.dataset.audioCueCount = String(this.cueCounter);
    root.dataset.audioDedupedCount = String(this.dedupedCounter);
    root.dataset.audioDroppedCount = String(this.droppedCounter);
    root.dataset.audioScene = this.desired.scene;
    root.dataset.audioMood = this.desired.mood;
    root.dataset.musicProgram = `${this.desired.scene}:${this.desired.stage}:${this.desired.route ?? "neutral"}`;
    root.dataset.audioErrorCode = errorCode;
  }

  async dispose() {
    this.unmountListeners?.();
    for (const voice of [...this.effects]) this.stopVoice(voice);
    for (const voice of this.loops.values()) {
      try { voice.source.stop(); } catch { /* already stopped */ }
      voice.source.disconnect();
      voice.gain.disconnect();
    }
    this.loops.clear();
    const context = this.graph?.context;
    this.graph = null;
    this.musicEpoch = null;
    this.buffers.clear();
    this.bufferOrder = [];
    if (context && context.state !== "closed") await context.close().catch(() => {});
    this.runtimeState = "locked";
    this.publishTelemetry();
  }
}
