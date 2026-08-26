# Niumpi audio v1

`generate_niumpi_audio.py` recreates the complete sound library in
`public/audio/niumpi-v1`. It uses no recordings, downloaded samples or human
voice. All material comes from deterministic oscillators, resonators,
envelopes and seeded noise (`SEED = 0x4E49554D`).

## Rebuild

Use Python 3 with NumPy and ffmpeg 7+ built with `libopus` and the native AAC
encoder:

```sh
python3 scripts/audio/generate_niumpi_audio.py --ffmpeg /absolute/path/to/ffmpeg
```

The generator deletes only files inside its output directory. It writes:

- three phase-aligned, 32-second stereo music stems in Opus and AAC;
- two seamless 16-second stereo ambience beds in Opus and AAC;
- mono 48 kHz PCM16 reaction and interface cues;
- a runtime manifest with gain, cooldown, polyphony, variation and cue maps;
- source hashes plus decoded sample-count, peak, loudness and seam validation.

## Mix intent

The base stem carries the harmonic identity. Warmth provides the celesta-like
motion, while sparkle adds quiet rhythmic detail. They are deliberately mixed
as independent layers so the runtime can respond to mood without restarting
the loop. The recommended master gain and reaction ducking live in the
manifest. Room and garden ambience sit roughly 10–15 dB below the music.

All three music stems decode to exactly 1,536,000 samples at 48 kHz. Both
codecs are validated after encoding; generation fails if AAC padding or Opus
pre-skip changes that count. Reaction sounds reserve at least 1 dBFS of peak
headroom and are short WAV files to avoid mobile decode latency.
