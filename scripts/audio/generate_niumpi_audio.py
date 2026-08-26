#!/usr/bin/env python3
"""Deterministically synthesize the original Niumpi v1 sound library.

No recordings or third-party samples are used.  Every waveform is generated
from oscillators, seeded noise, envelopes, resonators and simple dynamics.

The only Python dependency is NumPy.  An ffmpeg executable is needed to make
the WebM/Opus and M4A/AAC loop files; short effects stay PCM16 WAV so they are
small, seek-free and universally decodable.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import wave

try:
    import numpy as np
except ImportError as exc:  # pragma: no cover - developer guidance
    raise SystemExit(
        "NumPy is required. In Codex use load_workspace_dependencies and its bundled Python."
    ) from exc


SAMPLE_RATE = 48_000
SEED = 0x4E49554D  # "NIUM"
GENERATOR_VERSION = "1.0.0"
OUTPUT_DIR = Path(__file__).resolve().parents[2] / "public/audio/niumpi-v1"


def db(value: float) -> float:
    return 10.0 ** (value / 20.0)


def seed_for(name: str) -> int:
    digest = hashlib.sha256(f"{SEED}:{name}".encode()).digest()
    return int.from_bytes(digest[:8], "little")


def rng_for(name: str) -> np.random.Generator:
    return np.random.default_rng(seed_for(name))


def timebase(duration: float, channels: int = 1) -> tuple[np.ndarray, np.ndarray]:
    count = int(round(duration * SAMPLE_RATE))
    t = np.arange(count, dtype=np.float64) / SAMPLE_RATE
    return t, np.zeros((count, channels), dtype=np.float64)


def midi(note: float) -> float:
    return 440.0 * 2.0 ** ((note - 69.0) / 12.0)


def sine(t: np.ndarray, freq: float | np.ndarray, phase: float = 0.0) -> np.ndarray:
    if np.isscalar(freq):
        return np.sin(2.0 * np.pi * float(freq) * t + phase)
    phase_curve = 2.0 * np.pi * np.cumsum(np.asarray(freq, dtype=np.float64)) / SAMPLE_RATE
    return np.sin(phase_curve + phase)


def periodic_sine(t: np.ndarray, frequency: float, duration: float, phase: float = 0.0) -> np.ndarray:
    """A sine whose phase advances by an integer count over a loop."""
    cycles = max(1, round(frequency * duration))
    return np.sin(2.0 * np.pi * cycles * t / duration + phase)


def adsr(
    t: np.ndarray,
    start: float,
    length: float,
    attack: float = 0.012,
    release: float = 0.12,
    sustain: float = 1.0,
) -> np.ndarray:
    x = t - start
    env = np.zeros_like(t)
    active = (x >= 0.0) & (x < length)
    if not np.any(active):
        return env
    xa = x[active]
    a = max(attack, 1.0 / SAMPLE_RATE)
    r = max(release, 1.0 / SAMPLE_RATE)
    out = np.full_like(xa, sustain)
    attack_mask = xa < a
    out[attack_mask] *= 0.5 - 0.5 * np.cos(np.pi * xa[attack_mask] / a)
    release_mask = xa > length - r
    remain = np.clip((length - xa[release_mask]) / r, 0.0, 1.0)
    out[release_mask] *= 0.5 - 0.5 * np.cos(np.pi * remain)
    env[active] = out
    return env


def circular_decay(t: np.ndarray, onset: float, duration: float, loop_duration: float, decay: float) -> tuple[np.ndarray, np.ndarray]:
    local = np.mod(t - onset, loop_duration)
    env = np.where(local < duration, np.exp(-local / max(decay, 1e-5)), 0.0)
    # Four milliseconds of onset smoothing avoids a click while keeping attack crisp.
    env *= np.clip(local / 0.004, 0.0, 1.0)
    return local, env


def smooth_noise(name: str, count: int, cutoff_hz: float, periodic: bool = False) -> np.ndarray:
    noise = rng_for(name).standard_normal(count)
    if periodic:
        spectrum = np.fft.rfft(noise)
        freqs = np.fft.rfftfreq(count, 1.0 / SAMPLE_RATE)
        shape = 1.0 / np.sqrt(1.0 + (freqs / max(cutoff_hz, 1.0)) ** 8)
        return np.fft.irfft(spectrum * shape, count)
    # Deterministic one-pole low pass with a quiet initial state.
    alpha = 1.0 - math.exp(-2.0 * math.pi * cutoff_hz / SAMPLE_RATE)
    out = np.empty_like(noise)
    state = 0.0
    for i, value in enumerate(noise):
        state += alpha * (value - state)
        out[i] = state
    return out


def high_noise(name: str, count: int, cutoff_hz: float = 3_000.0) -> np.ndarray:
    raw = rng_for(name).standard_normal(count)
    low = smooth_noise(name + ":low", count, cutoff_hz)
    return raw - low


def pan(mono: np.ndarray, position: float) -> np.ndarray:
    angle = (np.clip(position, -1.0, 1.0) + 1.0) * np.pi / 4.0
    return np.column_stack((mono * np.cos(angle), mono * np.sin(angle)))


def soft_limit(audio: np.ndarray, peak_db: float = -1.0, drive: float = 1.15) -> np.ndarray:
    shaped = np.tanh(audio * drive) / np.tanh(drive)
    peak = float(np.max(np.abs(shaped))) if shaped.size else 0.0
    ceiling = db(peak_db)
    if peak > ceiling:
        shaped *= ceiling / peak
    return shaped


def normalize_rms(audio: np.ndarray, target_db: float, peak_db: float = -1.0) -> np.ndarray:
    rms = float(np.sqrt(np.mean(np.square(audio), dtype=np.float64)))
    if rms > 1e-12:
        audio = audio * (db(target_db) / rms)
    return soft_limit(audio, peak_db=peak_db, drive=1.04)


def fade_edges(audio: np.ndarray, milliseconds: float = 8.0) -> np.ndarray:
    n = min(int(SAMPLE_RATE * milliseconds / 1000.0), len(audio) // 2)
    if n <= 0:
        return audio
    ramp = np.sin(np.linspace(0.0, np.pi / 2.0, n, endpoint=False)) ** 2
    audio[:n] *= ramp[:, None] if audio.ndim == 2 else ramp
    audio[-n:] *= ramp[::-1, None] if audio.ndim == 2 else ramp[::-1]
    return audio


def chirp(t: np.ndarray, start_hz: float, end_hz: float, duration: float, curve: float = 1.0) -> np.ndarray:
    x = np.clip(t / max(duration, 1e-6), 0.0, 1.0)
    frequency = start_hz + (end_hz - start_hz) * x**curve
    return sine(t, frequency)


def resonant_note(t: np.ndarray, note: float, decay: float, brightness: float = 0.45, phase: float = 0.0) -> np.ndarray:
    f = midi(note)
    env = np.exp(-t / decay)
    return env * (
        sine(t, f, phase)
        + brightness * sine(t, f * 2.003, phase * 0.7)
        + brightness * 0.28 * sine(t, f * 3.997, phase + 0.4)
    )


def room_reverb(mono: np.ndarray, wet: float = 0.16) -> np.ndarray:
    out = mono.copy()
    for delay_ms, gain in ((37, 0.29), (61, 0.19), (89, 0.12), (131, 0.07)):
        delay = int(SAMPLE_RATE * delay_ms / 1000)
        if delay < len(out):
            out[delay:] += mono[:-delay] * gain * wet
    return out


def make_music_base() -> np.ndarray:
    duration = 32.0
    t, out = timebase(duration, 2)
    chords = (
        (48, 55, 59, 64),  # Cmaj7
        (45, 52, 57, 60),  # Am7
        (41, 48, 52, 57),  # Fmaj7
        (43, 50, 55, 59),  # G6
        (40, 47, 52, 55),  # Em7
        (45, 52, 57, 64),  # Am add9
        (38, 45, 50, 53),  # Dm7
        (43, 50, 53, 60),  # Gsus11
    )
    # Raised-cosine circular chord weights: no boundary discontinuity.
    slot = duration / len(chords)
    for index, chord in enumerate(chords):
        center = (index + 0.5) * slot
        distance = np.abs(np.mod(t - center + duration / 2.0, duration) - duration / 2.0)
        weight = np.where(distance < slot, 0.5 + 0.5 * np.cos(np.pi * distance / slot), 0.0)
        for voice, note in enumerate(chord):
            f = midi(note)
            lfo = 1.0 + 0.035 * periodic_sine(t, 0.125 + voice * 0.03125, duration, voice)
            left = periodic_sine(t, f * (1.0 - 0.0014), duration, 0.4 * voice)
            right = periodic_sine(t, f * (1.0 + 0.0014), duration, 0.7 + 0.33 * voice)
            harmonic_l = periodic_sine(t, f * 2.0, duration, 1.1 + voice)
            harmonic_r = periodic_sine(t, f * 2.0, duration, 0.3 + voice)
            out[:, 0] += weight * lfo * (left + 0.12 * harmonic_l) * 0.09
            out[:, 1] += weight * lfo * (right + 0.12 * harmonic_r) * 0.09
        root = periodic_sine(t, midi(chord[0] - 12), duration, 0.2)
        out += (weight * root * 0.065)[:, None]
    air = smooth_noise("music_base_air", len(t), 420.0, periodic=True)
    air /= max(float(np.std(air)), 1e-9)
    out += pan(air * (0.010 + 0.003 * periodic_sine(t, 0.0625, duration)), -0.08)
    return normalize_rms(out, -21.0, -1.5)


def make_music_warmth() -> np.ndarray:
    duration = 32.0
    t, out = timebase(duration, 2)
    pattern = (64, 67, 71, 76, 69, 72, 76, 81, 65, 69, 72, 76, 67, 71, 74, 79)
    for step in range(64):
        onset = step * 0.5
        note = pattern[step % len(pattern)] + (12 if step % 8 == 7 else 0)
        local, env = circular_decay(t, onset, 1.35, duration, 0.38)
        f = midi(note)
        bell = (
            sine(local, f)
            + 0.34 * sine(local, f * 2.006, 0.5)
            + 0.16 * sine(local, f * 3.997, 1.2)
            + 0.08 * sine(local, f * 6.11, 0.9)
        ) * env
        out += pan(bell * 0.105, -0.72 + 1.44 * ((step * 5) % 13) / 12.0)
    # Long bow-like harmonic breaths connect the arpeggio into one bed.
    for index, note in enumerate((60, 67, 72)):
        breath = periodic_sine(t, midi(note), duration, index * 1.7)
        modulation = 0.5 + 0.5 * periodic_sine(t, 0.0625, duration, index * 2.1)
        out += pan(breath * modulation * 0.018, (-0.6, 0.2, 0.65)[index])
    return normalize_rms(out, -24.0, -1.5)


def make_music_sparkle() -> np.ndarray:
    duration = 32.0
    t, out = timebase(duration, 2)
    hats = high_noise("music_sparkle_hats", len(t), 4_800.0)
    hats /= max(float(np.std(hats)), 1e-9)
    for step in range(64):
        onset = step * 0.5
        local, env = circular_decay(t, onset, 0.13, duration, 0.035)
        accent = 1.0 if step % 4 == 0 else 0.52
        tick = hats * env * 0.035 * accent
        out += pan(tick, -0.48 if step % 2 == 0 else 0.48)
        if step % 4 == 0:
            local_k, env_k = circular_decay(t, onset, 0.42, duration, 0.13)
            kick = sine(local_k, 56.0 + 58.0 * np.exp(-local_k / 0.055)) * env_k * 0.11
            out += pan(kick, 0.0)
        if step % 8 in (2, 6):
            note = (88, 91, 95, 98)[(step // 8) % 4]
            local_b, env_b = circular_decay(t, onset, 0.9, duration, 0.21)
            ping = (sine(local_b, midi(note)) + 0.24 * sine(local_b, midi(note) * 2.7)) * env_b * 0.07
            out += pan(ping, 0.7 if step % 8 == 2 else -0.7)
    return normalize_rms(out, -25.5, -1.5)


def make_ambience(kind: str) -> np.ndarray:
    duration = 16.0
    t, out = timebase(duration, 2)
    if kind == "room":
        air = smooth_noise("ambience_room_air", len(t), 260.0, periodic=True)
        air /= max(float(np.std(air)), 1e-9)
        hum = periodic_sine(t, 55.0, duration) + 0.34 * periodic_sine(t, 110.0, duration, 0.7)
        out += pan(air * 0.045, -0.15) + pan(hum * 0.012, 0.18)
        for onset, note, position in ((2.4, 84, -0.5), (9.8, 79, 0.55)):
            local, env = circular_decay(t, onset, 2.2, duration, 0.65)
            out += pan(resonant_note(local, note, 0.65) * env * 0.018, position)
        target = -34.0
    else:
        breeze = smooth_noise("ambience_garden_breeze", len(t), 1_100.0, periodic=True)
        breeze /= max(float(np.std(breeze)), 1e-9)
        sway = 0.55 + 0.45 * periodic_sine(t, 0.125, duration, 0.8)
        out += pan(breeze * sway * 0.05, -0.18)
        for onset, note, position in ((1.8, 91, -0.7), (6.2, 95, 0.5), (11.7, 88, 0.75)):
            local, env = circular_decay(t, onset, 1.8, duration, 0.45)
            out += pan(resonant_note(local, note, 0.42, 0.15) * env * 0.02, position)
        target = -32.5
    return normalize_rms(out, target, -3.0)


def sfx_tonal(asset_id: str, notes: tuple[float, ...], duration: float, mood: str = "soft") -> np.ndarray:
    t, _ = timebase(duration)
    out = np.zeros_like(t)
    spacing = min(0.16, duration / max(len(notes) + 1, 2))
    for index, note in enumerate(notes):
        onset = 0.012 + index * spacing
        local = np.maximum(t - onset, 0.0)
        decay = 0.20 if mood == "crisp" else 0.38
        env = adsr(t, onset, max(duration - onset - 0.015, 0.05), 0.006, min(0.18, duration * 0.3))
        tone = resonant_note(local, note, decay, 0.38 if mood == "crisp" else 0.20, phase=index * 0.4)
        out += tone * env * (0.82 ** index)
    if mood == "magic":
        shimmer = high_noise(asset_id + ":shimmer", len(t), 5_500.0)
        shimmer /= max(float(np.std(shimmer)), 1e-9)
        out += shimmer * adsr(t, 0.02, duration - 0.035, 0.02, duration * 0.55) * 0.025
    return out


def sfx_sweep(asset_id: str, duration: float, start: float, end: float, noise: float = 0.0) -> np.ndarray:
    t, _ = timebase(duration)
    env = adsr(t, 0.0, duration, min(0.025, duration * 0.2), duration * 0.35)
    out = chirp(t, start, end, duration, 0.65) * env
    out += 0.22 * chirp(t, start * 2.01, end * 2.01, duration, 0.7) * env
    if noise:
        texture = smooth_noise(asset_id + ":noise", len(t), 2_200.0)
        texture /= max(float(np.std(texture)), 1e-9)
        out += texture * env * noise
    return out


def make_sfx(asset_id: str) -> np.ndarray:
    """Render one mono reaction cue from a compact, stable asset id."""
    tonal: dict[str, tuple[tuple[float, ...], float, str]] = {
        "ui_hover": ((84,), 0.115, "crisp"),
        "ui_tap": ((72, 79), 0.16, "crisp"),
        "ui_confirm": ((76, 81, 88), 0.42, "crisp"),
        "ui_reward": ((72, 79, 84, 91), 0.82, "magic"),
        "ui_fail": ((64, 61), 0.38, "soft"),
        "pet_soft": ((76, 79), 0.46, "soft"),
        "pet_purr": ((48, 55), 0.95, "soft"),
        "hold_warm": ((60, 67, 72), 0.92, "soft"),
        "happy_peak": ((76, 83, 88, 95), 0.72, "magic"),
        "sleep_settle": ((72, 67, 64), 0.78, "soft"),
        "wake_rise": ((67, 72, 79, 84), 0.74, "magic"),
        "look_left": ((79, 83), 0.27, "crisp"),
        "look_right": ((83, 79), 0.27, "crisp"),
        "lamp_reach": ((67, 74), 0.32, "crisp"),
        "lamp_glow": ((72, 79, 84), 0.88, "magic"),
        "book_discovery": ((72, 76, 84, 88), 0.92, "magic"),
        "dance_beat_1": ((48,), 0.20, "crisp"),
        "dance_beat_2": ((55,), 0.20, "crisp"),
        "dance_beat_3": ((60,), 0.20, "crisp"),
        "dance_beat_4": ((67,), 0.25, "crisp"),
        "dance_air": ((72, 79), 0.43, "soft"),
        "dance_land": ((48, 60), 0.30, "crisp"),
        "sing_phrase_1": ((72, 76, 79), 0.78, "soft"),
        "sing_phrase_2": ((74, 79, 83), 0.82, "soft"),
        "sing_phrase_3": ((76, 81, 84, 88), 0.96, "soft"),
        "sing_release": ((79, 72), 0.46, "soft"),
        "roll_dizzy": ((84, 79, 86, 77), 0.76, "magic"),
        "travel_pulse_1": ((60, 72), 0.40, "magic"),
        "travel_pulse_2": ((64, 76), 0.40, "magic"),
        "travel_apex": ((76, 84, 91), 0.66, "magic"),
        "travel_arrive": ((67, 72, 79), 0.62, "crisp"),
        "cozy_contact": ((60, 67), 0.42, "soft"),
        "cozy_release": ((67, 72), 0.42, "soft"),
        "hatch_settled": ((60, 67, 72), 0.88, "soft"),
        "loot_rare": ((72, 79, 84, 91), 1.04, "magic"),
        "loot_legendary": ((60, 67, 72, 79, 84, 91), 1.62, "magic"),
    }
    if asset_id in tonal:
        notes, duration, mood = tonal[asset_id]
        out = sfx_tonal(asset_id, notes, duration, mood)
    elif asset_id == "leaf_rustle":
        t, _ = timebase(0.58)
        noise = high_noise(asset_id, len(t), 1_900.0)
        out = noise * adsr(t, 0.0, 0.58, 0.025, 0.24) * (0.25 + 0.75 * np.sin(2 * np.pi * 7 * t) ** 2)
    elif asset_id == "eat_anticipate":
        out = sfx_sweep(asset_id, 0.42, 240.0, 640.0, 0.025)
    elif asset_id.startswith("bite_"):
        index = int(asset_id[-1])
        duration = 0.19 + index * 0.015
        t, _ = timebase(duration)
        crunch = high_noise(asset_id, len(t), 1_600 + index * 420)
        crunch /= max(float(np.std(crunch)), 1e-9)
        env = np.exp(-t / (0.038 + index * 0.006)) * np.clip(t / 0.002, 0, 1)
        out = crunch * env * 0.52 + sine(t, 125 + index * 18) * env * 0.22
    elif asset_id == "swallow":
        t, _ = timebase(0.50)
        out = chirp(t, 280, 105, 0.5, 1.8) * adsr(t, 0.0, 0.5, 0.025, 0.18)
        out += smooth_noise(asset_id, len(t), 650) * adsr(t, 0.05, 0.38, 0.02, 0.16) * 1.3
    elif asset_id == "sad_drop":
        out = sfx_sweep(asset_id, 0.62, 510, 175, 0.02)
    elif asset_id in ("sad_sigh", "cozy_sigh"):
        duration = 0.92 if asset_id == "sad_sigh" else 0.76
        t, _ = timebase(duration)
        air = smooth_noise(asset_id, len(t), 900)
        air /= max(float(np.std(air)), 1e-9)
        out = air * adsr(t, 0.0, duration, 0.08, duration * 0.56) * 0.26
        out += chirp(t, 260 if asset_id == "sad_sigh" else 330, 130 if asset_id == "sad_sigh" else 220, duration) * adsr(t, 0.0, duration, 0.04, 0.42)
    elif asset_id == "sleep_breath":
        t, _ = timebase(1.20)
        air = smooth_noise(asset_id, len(t), 540)
        air /= max(float(np.std(air)), 1e-9)
        out = air * np.sin(np.pi * np.clip(t / 1.2, 0, 1)) ** 2 * 0.32
    elif asset_id == "sleep_murmur":
        t, _ = timebase(0.78)
        freq = 190 + 14 * np.sin(2 * np.pi * 3.2 * t)
        out = sine(t, freq) * adsr(t, 0, 0.78, 0.05, 0.42)
        out += sine(t, freq * 2.02, 0.6) * adsr(t, 0, 0.78, 0.05, 0.46) * 0.12
    elif asset_id == "wash_splash":
        t, _ = timebase(0.52)
        drops = np.zeros_like(t)
        for i, onset in enumerate((0.01, 0.08, 0.15, 0.25)):
            local = np.maximum(t - onset, 0)
            env = adsr(t, onset, 0.16, 0.002, 0.12)
            drops += chirp(local, 920 + i * 230, 430 + i * 95, 0.16) * env
        water = high_noise(asset_id, len(t), 2_800)
        out = drops * 0.23 + water * adsr(t, 0, 0.52, 0.01, 0.30) * 0.07
    elif asset_id == "wash_brush":
        t, _ = timebase(0.74)
        brush = high_noise(asset_id, len(t), 1_400)
        brush /= max(float(np.std(brush)), 1e-9)
        motion = 0.25 + 0.75 * np.sin(2 * np.pi * 5.5 * t) ** 2
        out = brush * motion * adsr(t, 0, 0.74, 0.03, 0.16) * 0.18
    elif asset_id in ("book_open", "book_close", "page_turn"):
        duration = {"book_open": 0.48, "book_close": 0.34, "page_turn": 0.41}[asset_id]
        t, _ = timebase(duration)
        paper = high_noise(asset_id, len(t), 1_200)
        paper /= max(float(np.std(paper)), 1e-9)
        motion = adsr(t, 0, duration, 0.015, duration * 0.35)
        out = paper * motion * 0.17 + chirp(t, 430, 180 if asset_id == "book_close" else 310, duration) * motion * 0.13
    elif asset_id == "sing_inhale":
        t, _ = timebase(0.43)
        air = smooth_noise(asset_id, len(t), 1_200)
        air /= max(float(np.std(air)), 1e-9)
        out = air * adsr(t, 0, 0.43, 0.16, 0.06) * 0.24
    elif asset_id == "sing_hold":
        t, _ = timebase(1.28)
        vibrato = 523.25 * (1 + 0.009 * np.sin(2 * np.pi * 5.2 * t))
        env = adsr(t, 0, 1.28, 0.10, 0.25)
        out = (sine(t, vibrato) + 0.18 * sine(t, vibrato * 2.01, 0.4)) * env
    elif asset_id.startswith("roll_") or asset_id in ("travel_depart", "travel_land"):
        params = {
            "roll_launch": (0.42, 180, 610, 0.05),
            "roll_contact": (0.24, 180, 92, 0.11),
            "roll_half": (0.34, 520, 280, 0.04),
            "roll_land": (0.32, 145, 72, 0.13),
            "travel_depart": (0.56, 220, 880, 0.03),
            "travel_land": (0.36, 310, 105, 0.10),
        }[asset_id]
        out = sfx_sweep(asset_id, *params)
    elif asset_id == "hatch_reveal":
        t, _ = timebase(2.20)
        out = np.zeros_like(t)
        for i, note in enumerate((60, 67, 72, 76, 79, 84, 88)):
            onset = i * 0.19
            local = np.maximum(t - onset, 0)
            out += resonant_note(local, note, 0.58, 0.35, i * 0.2) * adsr(t, onset, 1.1, 0.012, 0.55) * 0.32
        out += sfx_sweep(asset_id + ":rise", 2.2, 110, 680, 0.035) * 0.24
    elif asset_id == "evolve_rise":
        t, _ = timebase(2.84)
        out = sfx_sweep(asset_id, 2.84, 92, 820, 0.028) * 0.42
        for i, note in enumerate((48, 55, 60, 64, 67, 72, 76, 79, 84)):
            onset = 0.16 + i * 0.24
            local = np.maximum(t - onset, 0)
            out += resonant_note(local, note, 0.72, 0.42, i) * adsr(t, onset, 0.95, 0.015, 0.46) * 0.23
    else:
        raise KeyError(f"No synthesis recipe for {asset_id}")

    out = room_reverb(out, 0.14)
    out = fade_edges(out[:, None], 5.0)[:, 0]
    target = -19.0
    if asset_id in {"sleep_breath", "sleep_murmur", "sad_sigh", "cozy_sigh", "leaf_rustle", "sing_inhale"}:
        target = -24.0
    if asset_id in {"loot_legendary", "evolve_rise", "hatch_reveal"}:
        target = -18.0
    return normalize_rms(out, target, -1.0)


SFX_IDS = (
    "ui_hover", "ui_tap", "ui_confirm", "ui_reward", "ui_fail",
    "pet_soft", "pet_purr", "hold_warm", "leaf_rustle",
    "eat_anticipate", "bite_1", "bite_2", "bite_3", "swallow",
    "happy_peak", "sad_drop", "sad_sigh",
    "sleep_settle", "sleep_breath", "sleep_murmur", "wake_rise",
    "wash_splash", "wash_brush", "look_left", "look_right",
    "lamp_reach", "lamp_glow", "book_open", "page_turn", "book_discovery", "book_close",
    "dance_beat_1", "dance_beat_2", "dance_beat_3", "dance_beat_4", "dance_air", "dance_land",
    "sing_inhale", "sing_phrase_1", "sing_phrase_2", "sing_phrase_3", "sing_hold", "sing_release",
    "roll_launch", "roll_contact", "roll_half", "roll_land", "roll_dizzy",
    "travel_depart", "travel_pulse_1", "travel_pulse_2", "travel_apex", "travel_land", "travel_arrive",
    "cozy_contact", "cozy_sigh", "cozy_release", "hatch_reveal", "hatch_settled",
    "evolve_rise", "loot_rare", "loot_legendary",
)


def write_wav(path: Path, audio: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = np.clip(audio, -1.0, 1.0)
    pcm = np.round(data * 32767.0).astype("<i2")
    channels = 1 if pcm.ndim == 1 else pcm.shape[1]
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(pcm.tobytes())


def wav_info(audio: np.ndarray) -> dict[str, float | int]:
    peak = max(float(np.max(np.abs(audio))), 1e-12)
    rms = max(float(np.sqrt(np.mean(np.square(audio), dtype=np.float64))), 1e-12)
    return {
        "sampleCount": int(audio.shape[0]),
        "durationMs": round(audio.shape[0] * 1000.0 / SAMPLE_RATE, 3),
        "measuredPeakDbfs": round(20.0 * math.log10(peak), 2),
        "measuredRmsDbfs": round(20.0 * math.log10(rms), 2),
    }


def loop_seam_info(audio: np.ndarray) -> dict[str, float]:
    mono = np.mean(audio, axis=1) if audio.ndim == 2 else audio
    seam_delta = abs(float(mono[0] - mono[-1]))
    regular = np.abs(np.diff(mono))
    p95 = max(float(np.percentile(regular, 95)), 1e-12)
    derivative_before = float(mono[-1] - mono[-2])
    derivative_after = float(mono[1] - mono[0])
    return {
        "boundaryDelta": round(seam_delta, 8),
        "boundaryVsP95Step": round(seam_delta / p95, 4),
        "derivativeDelta": round(abs(derivative_after - derivative_before), 8),
    }


def find_ffmpeg(explicit: str | None) -> str:
    candidates = [explicit, os.environ.get("FFMPEG"), shutil.which("ffmpeg")]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return str(Path(candidate).resolve())
    raise SystemExit("ffmpeg not found; pass --ffmpeg /absolute/path/to/ffmpeg")


def encode_loop(ffmpeg: str, wav_path: Path, output_base: Path) -> tuple[Path, Path]:
    webm = output_base.with_suffix(".webm")
    m4a = output_base.with_suffix(".m4a")
    subprocess.run(
        [
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav_path),
            "-map_metadata", "-1", "-c:a", "libopus", "-b:a", "72k", "-vbr", "on",
            "-compression_level", "10", "-application", "audio", "-write_crc32", "0", str(webm),
        ],
        check=True,
    )
    subprocess.run(
        [
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav_path),
            "-map_metadata", "-1", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart",
            str(m4a),
        ],
        check=True,
    )
    # FFmpeg's WebM muxer assigns a random TrackUID on every run and repeats it
    # in the tag target. Stabilizing those two fixed-width EBML values makes the
    # checked-in artifact byte-reproducible without touching encoded packets.
    webm_bytes = bytearray(webm.read_bytes())
    stable_uid = hashlib.sha256(f"niumpi-webm:{output_base.name}".encode()).digest()[:8]
    for marker in (b"\x73\xc5\x88", b"\x63\xc5\x88"):
        position = webm_bytes.find(marker, 0, min(len(webm_bytes), 8192))
        if position < 0:
            raise RuntimeError(f"Expected WebM TrackUID marker missing in {webm}")
        webm_bytes[position + len(marker): position + len(marker) + 8] = stable_uid
    webm.write_bytes(webm_bytes)
    return webm, m4a


def source(path: Path, mime: str, codec: str) -> dict[str, str | int]:
    return {
        "src": "/audio/niumpi-v1/" + path.name,
        "type": mime,
        "codec": codec,
        "bytes": path.stat().st_size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }


def validate_encoded(ffmpeg: str, path: Path, expected_samples: int, channels: int) -> dict[str, object]:
    decoded = subprocess.run(
        [ffmpeg, "-hide_banner", "-loglevel", "error", "-i", str(path), "-f", "f32le", "-acodec", "pcm_f32le", "-"],
        check=True,
        stdout=subprocess.PIPE,
    ).stdout
    floats = np.frombuffer(decoded, dtype="<f4")
    if len(floats) % channels:
        raise RuntimeError(f"Decoded channel alignment failed for {path}")
    audio = floats.reshape((-1, channels))
    if len(audio) != expected_samples:
        raise RuntimeError(f"Decoded sample count mismatch for {path}: {len(audio)} != {expected_samples}")
    loudness_process = subprocess.run(
        [ffmpeg, "-hide_banner", "-nostats", "-i", str(path), "-filter_complex", "ebur128=peak=true", "-f", "null", "-"],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    report = loudness_process.stderr
    integrated = re.findall(r"Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+) LUFS", report)
    true_peak = re.findall(r"True peak:\s*\n\s*Peak:\s*(-?[\d.]+) dBFS", report)
    peak = max(float(np.max(np.abs(audio))), 1e-12)
    return {
        "decodedSampleCount": int(len(audio)),
        "decodedPeakDbfs": round(20.0 * math.log10(peak), 2),
        "integratedLufs": float(integrated[-1]) if integrated else None,
        "truePeakDbfs": float(true_peak[-1]) if true_peak else None,
        "decodedSeam": loop_seam_info(audio),
    }


def build_manifest_entry(
    asset_id: str,
    category: str,
    audio: np.ndarray,
    sources: list[dict[str, str | int]],
    loop: bool,
    gain_db: float,
) -> dict[str, object]:
    duration_seconds = audio.shape[0] / SAMPLE_RATE
    entry: dict[str, object] = {
        "id": asset_id,
        "category": category,
        "loop": loop,
        "durationSeconds": round(duration_seconds, 6),
        "gain": round(db(gain_db), 6),
        "gainDb": gain_db,
        "cooldownMs": 0 if loop else 55,
        "polyphony": 1 if loop else (3 if asset_id.startswith("ui_") else 2),
        "rateVariance": 0.0 if loop else 0.018,
        "reverb": 0.0 if loop else 0.08,
        "channels": 1 if audio.ndim == 1 else audio.shape[1],
        "sampleRate": SAMPLE_RATE,
        **wav_info(audio),
        "sources": sources,
    }
    if loop:
        entry["loopStartSeconds"] = 0.0
        entry["loopEndSeconds"] = round(duration_seconds, 6)
        entry["seam"] = loop_seam_info(audio)
    return entry


def generate(output_dir: Path, ffmpeg: str) -> dict[str, object]:
    output_dir.mkdir(parents=True, exist_ok=True)
    for old in output_dir.iterdir():
        if old.is_file():
            old.unlink()

    assets: dict[str, dict[str, object]] = {}
    music_specs = (
        ("music_base", "music", make_music_base, -1.0),
        ("music_warmth", "music", make_music_warmth, -2.0),
        ("music_sparkle", "music", make_music_sparkle, -3.5),
        ("ambience_room", "ambience", lambda: make_ambience("room"), -2.0),
        ("ambience_garden", "ambience", lambda: make_ambience("garden"), -2.0),
    )
    with tempfile.TemporaryDirectory(prefix="niumpi-audio-") as temp_dir:
        temp = Path(temp_dir)
        for asset_id, category, factory, gain_db in music_specs:
            # AAC transform windows and Opus pre-roll are not circular. A very short,
            # shared guard makes their decoded boundary silent instead of exposing a
            # codec-state click. At 64 ms this reads as one soft breath per loop;
            # the quieter noise beds use 128 ms because Opus retains more noise
            # history than it does tonal material.
            audio = fade_edges(factory(), 128.0 if category == "ambience" else 64.0)
            wav = temp / f"{asset_id}.wav"
            write_wav(wav, audio)
            webm, m4a = encode_loop(ffmpeg, wav, output_dir / asset_id)
            webm_source = source(webm, "audio/webm; codecs=opus", "opus")
            m4a_source = source(m4a, "audio/mp4; codecs=mp4a.40.2", "aac-lc")
            webm_source["validation"] = validate_encoded(ffmpeg, webm, len(audio), audio.shape[1])
            m4a_source["validation"] = validate_encoded(ffmpeg, m4a, len(audio), audio.shape[1])
            assets[asset_id] = build_manifest_entry(
                asset_id,
                category,
                audio,
                [webm_source, m4a_source],
                True,
                gain_db,
            )

    for asset_id in SFX_IDS:
        audio = make_sfx(asset_id)
        wav = output_dir / f"{asset_id}.wav"
        write_wav(wav, audio)
        assets[asset_id] = build_manifest_entry(
            asset_id,
            "effects",
            audio,
            [source(wav, "audio/wav", "pcm_s16le")],
            False,
            -1.0 if asset_id.startswith("ui_") else 0.0,
        )

    manifest: dict[str, object] = {
        "version": 1,
        "schemaVersion": 1,
        "sampleRate": SAMPLE_RATE,
        "library": "niumpi-v1",
        "generatorVersion": GENERATOR_VERSION,
        "provenance": {
            "kind": "procedural-original",
            "samplesFromInternet": False,
            "humanVoice": False,
            "seed": SEED,
            "description": "Original oscillator, seeded-noise, envelope and resonator synthesis.",
        },
        "mix": {
            "sampleRate": SAMPLE_RATE,
            "musicLoopSampleCount": assets["music_base"]["sampleCount"],
            "musicLoopDurationMs": assets["music_base"]["durationMs"],
            "recommendedMasterGainDb": -3.0,
            "duckMusicOnReactionDb": -2.5,
            "duckAttackMs": 35,
            "duckReleaseMs": 320,
        },
        "assets": assets,
        "cueMap": {
            "hover": ["ui_hover"], "tap": ["ui_tap"], "confirm": ["ui_confirm"],
            "reward": ["ui_reward"], "fail": ["ui_fail"],
            "pet": ["pet_soft", "pet_purr"], "hold": ["hold_warm"], "leaf": ["leaf_rustle"],
            "eat.anticipate": ["eat_anticipate"], "eat.bite": ["bite_1", "bite_2", "bite_3"],
            "eat.swallow": ["swallow"], "joy_peak": ["happy_peak"],
            "sad_drop": ["sad_drop"], "sad_sigh": ["sad_sigh"],
            "sleep_eyes_closed": ["sleep_settle"], "sleep_breath": ["sleep_breath"],
            "sleep_murmur": ["sleep_murmur"], "sleep_exit": ["wake_rise"],
            "wash.splash": ["wash_splash"], "wash.brush": ["wash_brush"],
            "look.left": ["look_left"], "look.right": ["look_right"],
            "lamp_reach": ["lamp_reach"], "lamp_contact": ["ui_tap"], "lamp_glow": ["lamp_glow"],
            "lamp_release": ["ui_hover"], "book_open": ["book_open"], "page_turn": ["page_turn"],
            "book_discovery": ["book_discovery"], "book_close": ["book_close"],
            "dance_beat": ["dance_beat_1", "dance_beat_2", "dance_beat_3", "dance_beat_4"],
            "dance_airborne": ["dance_air"], "dance_contact": ["dance_land"],
            "sing_inhale": ["sing_inhale"],
            "sing_vocal_phrase": ["sing_phrase_1", "sing_phrase_2", "sing_phrase_3"],
            "sing_held_note": ["sing_hold"], "sing_release": ["sing_release"],
            "roll_launch": ["roll_launch"], "roll_contact": ["roll_contact"],
            "roll_half": ["roll_half"], "roll_land": ["roll_land"], "roll_dizzy": ["roll_dizzy"],
            "travel_depart": ["travel_depart"], "travel_pulse": ["travel_pulse_1", "travel_pulse_2"],
            "travel_apex": ["travel_apex"], "travel_land": ["travel_land"],
            "travel_arrive": ["travel_arrive"], "cozy_contact": ["cozy_contact"],
            "cozy_curl": ["pet_purr"], "cozy_sigh": ["cozy_sigh"], "cozy_release": ["cozy_release"],
            "hatch_reveal": ["hatch_reveal"], "hatch_settled": ["hatch_settled"],
            "evolution_rise": ["evolve_rise"], "loot_rare": ["loot_rare"],
            "loot_legendary": ["loot_legendary"],
        },
    }
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=False) + "\n")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--ffmpeg", help="Absolute path to ffmpeg with libopus and AAC encoders")
    args = parser.parse_args()
    ffmpeg = find_ffmpeg(args.ffmpeg)
    manifest = generate(args.output.resolve(), ffmpeg)
    asset_count = len(manifest["assets"])
    total_bytes = sum(source_["bytes"] for asset in manifest["assets"].values() for source_ in asset["sources"])
    print(f"Generated {asset_count} assets ({total_bytes / 1024 / 1024:.2f} MiB) in {args.output}")


if __name__ == "__main__":
    main()
