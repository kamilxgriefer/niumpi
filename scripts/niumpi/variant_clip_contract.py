"""Single source of truth for Phase 14 and final semantic animation gates.

The default contract deliberately remains the Phase 14 core set.  Callers must
opt in with ``require_semantic=True`` before the nine final performances become
publication requirements.
"""

from __future__ import annotations


NON_BABY_REQUIRED_CLIPS = (
    "idle",
    "blink",
    "look_left",
    "look_right",
    "tap_reaction",
    "happy",
    "eat",
)

BABY_REQUIRED_CLIPS = (
    *NON_BABY_REQUIRED_CLIPS,
    "hatch_complete",
)

ALL_KNOWN_CORE_CLIPS = BABY_REQUIRED_CLIPS

SEMANTIC_REQUIRED_CLIPS = (
    "sad",
    "travel",
    "sleep",
    "read",
    "lamp",
    "dance",
    "sing",
    "roll",
    "cozy",
)

ALL_KNOWN_CLIPS = (*ALL_KNOWN_CORE_CLIPS, *SEMANTIC_REQUIRED_CLIPS)

ROUTE_FORM_VARIANTS = {"moonveil", "bloomheart", "sparkleap", "mistwander", "prismatic"}


def _events(*items: tuple[int, str]) -> tuple[tuple[int, str], ...]:
    return items


# Normative values mirror docs/animation/semantic-clips-contract.md.  Keeping
# the machine-readable portion here prevents Gate A and Gate B/C from drifting.
SEMANTIC_CLIP_CONTRACT: dict[str, dict] = {
    "sad": {
        "frameCount": 48, "loop": False, "transition": (6, 30, 12), "priority": 3,
        "events": _events((0, "clip_start"), (6, "sad_drop"), (18, "sad_sigh"),
                          (36, "recovery_start"), (47, "clip_complete")),
        "features": {"body", "head", "pupils", "mouth", "cheeks", "feet", "leaf"},
        "arms": True, "routeAccessory": 0.020,
        "minimums": {"controls": 6, "channels": 10, "regions": 6},
        "displacement": {"root": 0.018, "body": 0.022, "head": 0.035, "pupils": 0.025,
                         "mouth": 0.018, "cheeks": 0.018, "feet": 0.010, "leaf": 0.035,
                         "arms": 0.025},
        # Stage 1 is one continuous cloud mass with tiny feet and no arms.
        # Its local gates are therefore calibrated to visible in-plane motion
        # that remains inside the approved pearl silhouette; evolved-form
        # thresholds would force the baby mesh to tear into fake body parts.
        "babyOverrides": {"body": 0.010},
    },
    "travel": {
        "frameCount": 72, "loop": False, "transition": (8, 48, 16), "priority": 1,
        "events": _events((0, "clip_start"), (8, "travel_depart"),
                          (20, "travel_pulse"), (32, "travel_pulse"),
                          (44, "travel_apex"), (56, "travel_land"),
                          (71, "travel_arrive"), (71, "clip_complete")),
        "features": {"body", "head", "feet", "leaf", "shadow"},
        "arms": True, "tail": 0.140, "routeAccessory": 0.050,
        "minimums": {"controls": 6, "channels": 10, "regions": 6},
        "displacement": {"root": 0.090, "body": 0.060, "head": 0.045, "feet": 0.080,
                         "leaf": 0.100, "shadow": 0.060, "arms": 0.060},
        "babyOverrides": {"body": 0.036, "feet": 0.024, "leaf": 0.068,
                          "shadow": 0.042},
        "babyPhaseEvidence": {"land": 0.012},
        "phaseEvidence": {"prepare": 0.015, "pulseCount": 2, "apex": 0.050, "land": 0.020},
    },
    "sleep": {
        "frameCount": 112, "loop": True, "transition": (16, 80, 16), "priority": 5,
        "loopRange": (16, 96), "exitRange": (96, 112), "fingerprintRange": (16, 96),
        "subloopMotion": 0.010,
        "events": _events((0, "clip_start"), (12, "sleep_eyes_closed"),
                          (16, "sleep_loop_enter"), (36, "sleep_breath"),
                          (68, "sleep_breath"), (80, "sleep_murmur"),
                          (95, "sleep_loop_end"), (96, "sleep_exit"),
                          (111, "clip_complete")),
        "features": {"body", "head", "eyelids", "feet", "leaf", "shadow"},
        "arms": True, "tail": 0.035,
        "minimums": {"controls": 6, "channels": 10, "regions": 6},
        "displacement": {"root": 0.045, "body": 0.040, "head": 0.035, "feet": 0.020,
                         "leaf": 0.030, "shadow": 0.020, "arms": 0.030},
        "eyeClosure": 0.85,
        "babyOverrides": {"body": 0.0115, "head": 0.023, "feet": 0.015,
                          "shadow": 0.013},
        "babySubloopMotion": 0.006,
    },
    "read": {
        "frameCount": 84, "loop": False, "transition": (12, 56, 16), "priority": 2,
        "events": _events((0, "clip_start"), (10, "prop_attach"), (12, "book_open"),
                          (24, "reading_pass"), (34, "reading_pass"), (40, "page_turn"),
                          (52, "reading_pass"), (56, "book_discovery"), (68, "book_close"),
                          (76, "prop_detach"), (83, "clip_complete")),
        "features": {"body", "head", "pupils", "feet", "leaf"}, "arms": True,
        "minimums": {"controls": 5, "channels": 8, "regions": 5},
        "displacement": {"root": 0.020, "body": 0.025, "head": 0.040, "pupils": 0.035,
                         "feet": 0.012, "leaf": 0.035, "arms": 0.060},
        "babyOverrides": {"body": 0.014, "head": 0.009, "pupils": 0.010,
                          "feet": 0.005, "leaf": 0.012},
    },
    "lamp": {
        "frameCount": 48, "loop": False, "transition": (8, 24, 16), "priority": 2,
        "events": _events((0, "clip_start"), (8, "lamp_reach"), (18, "lamp_contact"),
                          (20, "lamp_glow"), (32, "lamp_release"), (47, "clip_complete")),
        "features": {"body", "head", "pupils", "mouth", "cheeks", "feet", "leaf"},
        "arms": True,
        "minimums": {"controls": 6, "channels": 10, "regions": 6},
        "displacement": {"root": 0.025, "body": 0.035, "head": 0.050, "pupils": 0.040,
                         "mouth": 0.015, "cheeks": 0.015, "feet": 0.015, "leaf": 0.050,
                         "arms": 0.025, "oneArm": 0.090},
        "babyOverrides": {"body": 0.0024, "head": 0.0018, "pupils": 0.010,
                          "mouth": 0.0045, "cheeks": 0.0028, "feet": 0.0022,
                          "leaf": 0.032},
    },
    "dance": {
        "frameCount": 72, "loop": False, "transition": (8, 52, 12), "priority": 2,
        "events": _events((0, "clip_start"), (8, "dance_beat"), (24, "dance_beat"),
                          (28, "dance_airborne"), (40, "dance_beat"), (44, "dance_contact"),
                          (56, "dance_beat"), (60, "recovery_start"), (71, "clip_complete")),
        "features": {"body", "head", "pupils", "mouth", "cheeks", "feet", "leaf", "shadow"},
        "arms": True, "tail": 0.150, "routeAccessory": 0.070,
        "minimums": {"controls": 7, "channels": 12, "regions": 7},
        "displacement": {"root": 0.110, "body": 0.090, "head": 0.065, "pupils": 0.025,
                         "mouth": 0.020, "cheeks": 0.020, "feet": 0.100, "leaf": 0.140,
                         "shadow": 0.070, "arms": 0.120},
        "babyOverrides": {"root": 0.100, "body": 0.065, "feet": 0.030,
                          "leaf": 0.140},
    },
    "sing": {
        "frameCount": 96, "loop": False, "transition": (8, 72, 16), "priority": 2,
        "events": _events((0, "clip_start"), (6, "sing_inhale"), (12, "vocal_phrase"),
                          (16, "mouth_cue"), (24, "mouth_cue"), (32, "vocal_phrase"),
                          (36, "mouth_cue"), (44, "mouth_cue"), (52, "vocal_phrase"),
                          (56, "mouth_cue"), (56, "sing_held_note"), (68, "mouth_cue"),
                          (80, "sing_release"), (95, "clip_complete")),
        "features": {"body", "head", "pupils", "mouth", "cheeks", "feet", "leaf"},
        "arms": True, "tail": 0.060, "routeAccessory": 0.035,
        "minimums": {"controls": 7, "channels": 12, "regions": 7},
        "displacement": {"root": 0.035, "body": 0.040, "head": 0.050, "pupils": 0.020,
                         "mouth": 0.045, "cheeks": 0.025, "feet": 0.020, "leaf": 0.070,
                         "arms": 0.060},
        "babyOverrides": {"body": 0.005, "head": 0.0075, "pupils": 0.0048,
                          "mouth": 0.014, "cheeks": 0.005, "feet": 0.0055,
                          "leaf": 0.060},
    },
    "roll": {
        "frameCount": 60, "loop": False, "transition": (8, 36, 16), "priority": 2,
        "events": _events((0, "clip_start"), (8, "roll_launch"), (14, "roll_contact"),
                          (26, "roll_half"), (32, "roll_contact"), (44, "roll_land"),
                          (48, "roll_dizzy"), (59, "clip_complete")),
        "features": {"body", "head", "mouth", "cheeks", "feet", "leaf", "shadow"},
        "arms": True, "tail": 0.200, "routeAccessory": 0.100,
        "minimums": {"controls": 7, "channels": 12, "regions": 7},
        "displacement": {"root": 0.150, "body": 0.120, "head": 0.090, "mouth": 0.020,
                         "cheeks": 0.020, "feet": 0.110, "leaf": 0.180,
                         "shadow": 0.080, "arms": 0.100},
        "babyOverrides": {"body": 0.012, "head": 0.010, "feet": 0.026,
                          "leaf": 0.032, "shadow": 0.050},
        "phaseEvidence": {"silhouetteStates": 4},
    },
    "cozy": {
        "frameCount": 72, "loop": False, "transition": (12, 44, 16), "priority": 3,
        "fingerprintRange": (24, 56), "subloopMotion": 0.020,
        "events": _events((0, "clip_start"), (10, "prop_attach"), (12, "cozy_contact"),
                          (24, "cozy_curl"), (36, "cozy_sigh"), (52, "cozy_hold_end"),
                          (56, "cozy_release"), (64, "prop_detach"), (71, "clip_complete")),
        "features": {"body", "head", "eyelids", "mouth", "cheeks", "feet", "leaf"},
        "arms": True, "tail": 0.070, "routeAccessory": 0.035,
        "minimums": {"controls": 7, "channels": 12, "regions": 7},
        "displacement": {"root": 0.040, "body": 0.050, "head": 0.040, "mouth": 0.022,
                         "cheeks": 0.022, "feet": 0.025, "leaf": 0.045, "arms": 0.065},
        "babyOverrides": {"body": 0.022, "head": 0.025, "feet": 0.009},
        "eyeClosureRange": (0.35, 0.70),
    },
}


def required_clips_for_variant(variant: str, require_semantic: bool = False) -> tuple[str, ...]:
    """Resolve the opt-in final repertoire without changing Phase 14 defaults."""

    core = BABY_REQUIRED_CLIPS if variant in {"baby", "stage-1"} else NON_BABY_REQUIRED_CLIPS
    return (*core, *SEMANTIC_REQUIRED_CLIPS) if require_semantic else core


def semantic_contract(name: str) -> dict:
    if name not in SEMANTIC_CLIP_CONTRACT:
        raise AssertionError(f"no semantic clip contract for {name}")
    return SEMANTIC_CLIP_CONTRACT[name]


def semantic_features_for_variant(name: str, variant: str, arms_present: bool) -> set[str]:
    spec = semantic_contract(name)
    features = set(spec["features"])
    if spec.get("arms") and arms_present:
        features.add("arms")
    if variant == "mistwander" and spec.get("tail"):
        features.add("tail")
    if variant in ROUTE_FORM_VARIANTS and spec.get("routeAccessory"):
        features.add("accessory")
    return features


def semantic_displacement_for_variant(name: str, variant: str, arms_present: bool) -> dict[str, float]:
    spec = semantic_contract(name)
    result = {key: float(value) for key, value in spec["displacement"].items()}
    if variant in {"baby", "stage-1"}:
        result.update({key: float(value) for key, value in spec.get("babyOverrides", {}).items()})
    if not arms_present:
        result.pop("arms", None)
        result.pop("oneArm", None)
    if variant == "mistwander" and spec.get("tail"):
        result["tail"] = float(spec["tail"])
    if variant in ROUTE_FORM_VARIANTS and spec.get("routeAccessory"):
        result["accessory"] = float(spec["routeAccessory"])
    return result


def validate_semantic_clip_metadata(name: str, clip: dict) -> list[str]:
    """Validate final manifest timing/markers independently from render data."""

    spec = semantic_contract(name)
    reasons: list[str] = []
    expected_count = int(spec["frameCount"])
    if clip.get("fps") != 24:
        reasons.append(f"fps {clip.get('fps')!r} != 24")
    if clip.get("frameCount") != expected_count:
        reasons.append(f"frameCount {clip.get('frameCount')!r} != {expected_count}")
    if clip.get("loop") is not spec["loop"]:
        reasons.append(f"loop {clip.get('loop')!r} != {spec['loop']!r}")
    transition = clip.get("transition", {})
    actual_transition = (
        transition.get("anticipationFrames"),
        transition.get("actionFrames"),
        transition.get("recoveryFrames"),
    ) if isinstance(transition, dict) else None
    if actual_transition != tuple(spec["transition"]):
        reasons.append(f"transition {actual_transition!r} != {tuple(spec['transition'])!r}")
    for key in ("loopRange", "exitRange"):
        expected = spec.get(key)
        actual = clip.get(key)
        if expected is None:
            if actual is not None:
                reasons.append(f"unexpected {key} {actual!r}")
            continue
        expected_object = {"startFrame": expected[0], "endFrameExclusive": expected[1]}
        if actual != expected_object:
            reasons.append(f"{key} {actual!r} != {expected_object!r}")
    actual_events = [(event.get("frame"), event.get("type")) for event in clip.get("events", []) if isinstance(event, dict)]
    expected_events = list(spec["events"])
    if actual_events != expected_events:
        missing_events = [event for event in expected_events if event not in actual_events]
        detail = ", ".join(f"{kind}@{frame}" for frame, kind in missing_events) or "unexpected marker/order"
        reasons.append("missing/wrong marker(s): " + detail)
    frames = clip.get("frames")
    if isinstance(frames, list) and len(frames) != expected_count:
        reasons.append(f"frames length {len(frames)} != {expected_count}")
    duration = clip.get("durationMs")
    expected_duration = expected_count * 1000.0 / 24.0
    if not isinstance(duration, (int, float)) or abs(float(duration) - expected_duration) > 1.0:
        reasons.append(f"durationMs {duration!r} != {expected_duration:.3f}±1")
    return reasons


def validate_semantic_fingerprints(clips: dict[str, dict], *, idle_fingerprint: str | None) -> list[str]:
    """Reject nine labels backed by idle or by one shared motion trajectory."""

    reasons: list[str] = []
    owners: dict[str, str] = {}
    for name in SEMANTIC_REQUIRED_CLIPS:
        report = clips.get(name)
        if not isinstance(report, dict):
            reasons.append(f"missing semantic motion result for {name}")
            continue
        fingerprint = report.get("motionFingerprint")
        if not isinstance(fingerprint, str) or not fingerprint:
            reasons.append(f"{name} has no motion fingerprint")
            continue
        if idle_fingerprint and fingerprint == idle_fingerprint:
            reasons.append(f"{name} motion is identical to idle")
        previous = owners.get(fingerprint)
        if previous:
            reasons.append(f"{name} motion is identical to {previous}")
        else:
            owners[fingerprint] = name
        spec = semantic_contract(name)
        if "fingerprintRange" in spec:
            subloop = report.get("subloopFingerprint")
            if not isinstance(subloop, str) or not subloop:
                reasons.append(f"{name} has no subloop fingerprint")
            elif idle_fingerprint and subloop == idle_fingerprint:
                reasons.append(f"{name} subloop is identical to idle")
    return reasons

    return BABY_REQUIRED_CLIPS if variant in {"baby", "stage-1"} else NON_BABY_REQUIRED_CLIPS
