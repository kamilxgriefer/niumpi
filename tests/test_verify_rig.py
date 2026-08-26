from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("verify_rig", REPO / "scripts/niumpi/verify_rig.py")
assert SPEC and SPEC.loader
VERIFY_RIG = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFY_RIG)


def passing_clips(clips=VERIFY_RIG.CORE_CLIPS) -> dict[str, dict]:
    return {
        clip: {
            "result": "PASS",
            "animatedControls": ["body"],
            "animatedChannels": ["body.location[0]"],
            "regions": ["body"],
            "blinkClosure": 1.0 if clip == "blink" else 0.0,
        }
        for clip in clips
    }


def manifest(
    variant: str,
    clips=VERIFY_RIG.CORE_CLIPS,
    *,
    schema_version: int = 2,
) -> dict:
    return {
        "schemaVersion": schema_version,
        "variant": variant,
        "clips": {clip: {"frames": []} for clip in clips},
    }


def semantic_manifest_clip(name: str) -> dict:
    spec = VERIFY_RIG.semantic_contract(name)
    clip = {
        "fps": 24,
        "frameCount": spec["frameCount"],
        "durationMs": spec["frameCount"] * 1000 / 24,
        "loop": spec["loop"],
        "transition": {
            "anticipationFrames": spec["transition"][0],
            "actionFrames": spec["transition"][1],
            "recoveryFrames": spec["transition"][2],
        },
        "events": [{"frame": frame, "type": kind} for frame, kind in spec["events"]],
        "frames": [{} for _ in range(spec["frameCount"])],
    }
    for key in ("loopRange", "exitRange"):
        if key in spec:
            clip[key] = {"startFrame": spec[key][0], "endFrameExclusive": spec[key][1]}
    return clip


def final_manifest(variant: str) -> dict:
    required = VERIFY_RIG.required_clips_for_variant(variant, True)
    payload = manifest(variant, required)
    for name in VERIFY_RIG.SEMANTIC_REQUIRED_CLIPS:
        payload["clips"][name] = semantic_manifest_clip(name)
    return payload


class VariantResolverTests(unittest.TestCase):
    def test_all_ten_production_variants_resolve_from_landmarks(self) -> None:
        self.assertEqual(len(VERIFY_RIG.PRODUCTION_VARIANTS), 10)
        for variant in VERIFY_RIG.PRODUCTION_VARIANTS:
            with self.subTest(variant=variant):
                config = VERIFY_RIG.resolve_variant(variant)
                self.assertEqual(config["variant"], variant)
                self.assertTrue(config["approvedArt"].is_file())
                self.assertEqual(
                    VERIFY_RIG.file_sha256(config["approvedArt"]),
                    config["approvedArtSha256"],
                )
                self.assertEqual(len(config["leafBonePairs"]), config["visibleLeaves"])

    def test_baby_and_stage_one_alias_share_the_strict_legacy_rig(self) -> None:
        baby = VERIFY_RIG.resolve_variant("baby")
        alias = VERIFY_RIG.resolve_variant("stage-1")

        self.assertEqual(alias["variant"], "baby")
        self.assertEqual(alias["master"], baby["master"])
        self.assertEqual(alias["manifest"], baby["manifest"])
        self.assertEqual(alias["landmarkVariant"], "stage-1")
        self.assertFalse(alias["continuousSkin"])
        self.assertIn("eyelid_upper.L", alias["requiredBones"])
        self.assertEqual(alias["requiredClips"], VERIFY_RIG.BABY_CORE_CLIPS)
        self.assertIn("hatch_complete", alias["requiredClips"])

    def test_stage_two_requires_two_landmark_derived_leaf_chains(self) -> None:
        config = VERIFY_RIG.resolve_variant("stage-2")

        self.assertTrue(config["continuousSkin"])
        self.assertTrue(config["armsPresent"])
        self.assertEqual(config["visibleLeaves"], 2)
        self.assertEqual(len(config["leafBonePairs"]), 2)
        self.assertIn(("leaf_stem_01", "leaf_stem_02"), config["leafBonePairs"])
        self.assertIn("arm.L", config["requiredBones"])
        self.assertNotIn("eyelid_upper.L", config["requiredBones"])
        self.assertEqual(config["requiredClips"], VERIFY_RIG.NON_BABY_CORE_CLIPS)
        self.assertNotIn("hatch_complete", config["requiredClips"])

    def test_final_mode_is_explicit_and_requires_core_plus_nine(self) -> None:
        core = VERIFY_RIG.resolve_variant("stage-2")
        final = VERIFY_RIG.resolve_variant("stage-2", require_semantic=True)

        self.assertEqual(core["requiredClips"], VERIFY_RIG.NON_BABY_CORE_CLIPS)
        self.assertFalse(core["requireSemantic"])
        self.assertTrue(final["requireSemantic"])
        self.assertEqual(len(final["requiredClips"]), 16)
        self.assertTrue(set(VERIFY_RIG.SEMANTIC_REQUIRED_CLIPS).issubset(final["requiredClips"]))

    def test_stage_five_requires_all_five_visible_leaf_chains(self) -> None:
        config = VERIFY_RIG.resolve_variant("stage-5")

        self.assertEqual(config["visibleLeaves"], 5)
        self.assertEqual(len(config["leafBonePairs"]), 5)
        for base, tip in config["leafBonePairs"][1:]:
            self.assertEqual(config["expectedParents"][base], "head")
            self.assertEqual(config["expectedParents"][tip], base)

    def test_mistwander_uses_three_detected_not_five_canonical_leaves(self) -> None:
        config = VERIFY_RIG.resolve_variant("mistwander")

        self.assertEqual(config["profile"]["topology"]["canonicalPrimaryLeaves"], 5)
        self.assertEqual(config["profile"]["topology"]["detectedPrimaryLeaves"], 3)
        self.assertEqual(config["visibleLeaves"], 3)
        self.assertEqual(len(config["leafBonePairs"]), 3)

    def test_missing_manifest_and_master_are_explicit_static_failures(self) -> None:
        config = VERIFY_RIG.resolve_variant("stage-2")
        config = dict(config, master=Path("/definitely/missing/master.blend"), manifest=Path("/definitely/missing/manifest.json"))

        reasons = VERIFY_RIG.static_input_errors(config)

        self.assertTrue(any("master does not exist" in reason for reason in reasons))
        self.assertTrue(any("manifest does not exist" in reason for reason in reasons))


class RigGazeContractTests(unittest.TestCase):
    def test_gate_a_uses_the_same_bilateral_pre_bite_ratio_contract(self) -> None:
        result = VERIFY_RIG.evaluate_pupil_gaze_tracks(
            {
                "pupil.L": [(1, 0.0, 0.0), (8, -2.0, -0.4)],
                "pupil.R": [(1, 0.0, 0.0), (9, -2.0, -0.4)],
            },
            {"pupil.L": 30.0, "pupil.R": 30.0},
            first_bite_frame=12,
            expected_direction=(-1.0, -0.2),
        )

        self.assertEqual(result["result"], "PASS", result)
        self.assertEqual(result["minimumDisplacementPerDiameter"], 0.06)
        self.assertTrue(all(
            eye["directionCosine"] >= 0.70 for eye in result["perEye"].values()
        ))

    def test_projected_screen_direction_is_independent_of_mirrored_local_basis(self) -> None:
        head = (0.50, 0.50)
        neutral = (0.55, 0.50)
        resolution = (200.0, 200.0)

        def projected_track(local_sign: float, basis_sign: float):
            baseline = VERIFY_RIG.camera_relative_px(neutral, head, resolution)
            moved = VERIFY_RIG.camera_relative_px(
                (neutral[0] + local_sign * basis_sign * 0.01, neutral[1]),
                head,
                resolution,
            )
            return [(6, moved[0] - baseline[0], moved[1] - baseline[1])]

        for label, track in (
            ("canonical local - through - basis", projected_track(-1.0, -1.0)),
            ("mirrored local + through + basis", projected_track(1.0, 1.0)),
        ):
            with self.subTest(label=label):
                result = VERIFY_RIG.evaluate_pupil_gaze_tracks(
                    {"pupil.L": track, "pupil.R": track},
                    {"pupil.L": 30.0, "pupil.R": 30.0},
                    first_bite_frame=10,
                    expected_direction=(1.0, 0.0),
                )
                self.assertEqual(result["result"], "PASS", result)

        screen_left = projected_track(1.0, -1.0)
        wrong = VERIFY_RIG.evaluate_pupil_gaze_tracks(
            {"pupil.L": screen_left, "pupil.R": screen_left},
            {"pupil.L": 30.0, "pupil.R": 30.0},
            first_bite_frame=10,
            expected_direction=(1.0, 0.0),
        )
        self.assertEqual(wrong["result"], "FAIL")
        self.assertTrue(any("direction cosine" in reason for reason in wrong["reasons"]))


class ManifestEnrichmentTests(unittest.TestCase):
    def test_full_pass_is_written_atomically_for_selected_variant(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "manifest.json"
            path.write_text(
                json.dumps(manifest("stage-2", VERIFY_RIG.NON_BABY_CORE_CLIPS)),
                encoding="utf-8",
            )

            result = VERIFY_RIG.enrich_manifest(
                path,
                passing_clips(VERIFY_RIG.NON_BABY_CORE_CLIPS),
                expected_variant="stage-2",
                required_clips=VERIFY_RIG.NON_BABY_CORE_CLIPS,
            )
            updated = json.loads(path.read_text(encoding="utf-8"))

            self.assertEqual(result["result"], "UPDATED")
            self.assertNotIn("hatch_complete", updated["clips"])
            self.assertTrue(all("rigProof" in updated["clips"][clip] for clip in VERIFY_RIG.NON_BABY_CORE_CLIPS))
            self.assertEqual(list(path.parent.glob(".manifest.json.gate-a-*.tmp")), [])

    def test_schema_three_accepts_rig_proof_enrichment_without_rewriting_schema(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "manifest.json"
            payload = manifest(
                "stage-3",
                VERIFY_RIG.NON_BABY_CORE_CLIPS,
                schema_version=3,
            )
            payload["rigProof"] = {
                "animatedControls": ["existing-top-level-control"],
                "animatedChannels": ["existing-top-level-channel"],
                "regions": ["body"],
            }
            path.write_text(json.dumps(payload), encoding="utf-8")

            VERIFY_RIG.enrich_manifest(
                path,
                passing_clips(VERIFY_RIG.NON_BABY_CORE_CLIPS),
                expected_variant="stage-3",
                required_clips=VERIFY_RIG.NON_BABY_CORE_CLIPS,
            )
            updated = json.loads(path.read_text(encoding="utf-8"))

            self.assertEqual(updated["schemaVersion"], 3)
            self.assertEqual(updated["rigProof"], payload["rigProof"])
            self.assertTrue(
                all("rigProof" in updated["clips"][name] for name in VERIFY_RIG.NON_BABY_CORE_CLIPS)
            )

    def test_unsupported_manifest_schema_fails_without_changing_file(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "manifest.json"
            original = json.dumps(
                manifest("stage-2", VERIFY_RIG.NON_BABY_CORE_CLIPS, schema_version=1),
                sort_keys=True,
            )
            path.write_text(original, encoding="utf-8")

            with self.assertRaisesRegex(AssertionError, "expected 2 or 3"):
                VERIFY_RIG.enrich_manifest(
                    path,
                    passing_clips(VERIFY_RIG.NON_BABY_CORE_CLIPS),
                    expected_variant="stage-2",
                    required_clips=VERIFY_RIG.NON_BABY_CORE_CLIPS,
                )

            self.assertEqual(json.dumps(json.loads(path.read_text()), sort_keys=True), original)

    def test_failed_clip_never_changes_existing_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "manifest.json"
            original = json.dumps(manifest("mistwander"), sort_keys=True)
            path.write_text(original, encoding="utf-8")
            clips = passing_clips()
            clips["idle"] = dict(clips["idle"], result="FAIL")

            with self.assertRaisesRegex(AssertionError, "failed rig proof"):
                VERIFY_RIG.enrich_manifest(
                    path,
                    clips,
                    expected_variant="mistwander",
                    required_clips=VERIFY_RIG.NON_BABY_CORE_CLIPS,
                )

            self.assertEqual(json.dumps(json.loads(path.read_text()), sort_keys=True), original)

    def test_missing_or_wrong_variant_manifest_fails_without_creating_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            missing = Path(temporary) / "missing.json"
            with self.assertRaisesRegex(AssertionError, "does not exist"):
                VERIFY_RIG.enrich_manifest(
                    missing,
                    passing_clips(),
                    expected_variant="stage-5",
                    required_clips=VERIFY_RIG.NON_BABY_CORE_CLIPS,
                )
            self.assertFalse(missing.exists())

            wrong = Path(temporary) / "manifest.json"
            original = json.dumps(manifest("baby"), sort_keys=True)
            wrong.write_text(original, encoding="utf-8")
            with self.assertRaisesRegex(AssertionError, "expected 'stage-5'"):
                VERIFY_RIG.enrich_manifest(
                    wrong,
                    passing_clips(),
                    expected_variant="stage-5",
                    required_clips=VERIFY_RIG.NON_BABY_CORE_CLIPS,
                )
            self.assertEqual(json.dumps(json.loads(wrong.read_text()), sort_keys=True), original)

    def test_baby_still_fails_without_hatch_complete(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "manifest.json"
            original = json.dumps(manifest("baby", VERIFY_RIG.NON_BABY_CORE_CLIPS), sort_keys=True)
            path.write_text(original, encoding="utf-8")

            with self.assertRaisesRegex(AssertionError, "hatch_complete"):
                VERIFY_RIG.enrich_manifest(
                    path,
                    passing_clips(VERIFY_RIG.NON_BABY_CORE_CLIPS),
                    expected_variant="baby",
                    required_clips=VERIFY_RIG.BABY_CORE_CLIPS,
                )

            self.assertEqual(json.dumps(json.loads(path.read_text()), sort_keys=True), original)

    def test_non_baby_still_fails_when_any_of_the_seven_clips_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "manifest.json"
            incomplete = tuple(clip for clip in VERIFY_RIG.NON_BABY_CORE_CLIPS if clip != "eat")
            original = json.dumps(manifest("stage-5", incomplete), sort_keys=True)
            path.write_text(original, encoding="utf-8")

            with self.assertRaisesRegex(AssertionError, "eat"):
                VERIFY_RIG.enrich_manifest(
                    path,
                    passing_clips(VERIFY_RIG.NON_BABY_CORE_CLIPS),
                    expected_variant="stage-5",
                    required_clips=VERIFY_RIG.NON_BABY_CORE_CLIPS,
                )

            self.assertEqual(json.dumps(json.loads(path.read_text()), sort_keys=True), original)

    def test_final_enrichment_fails_when_one_semantic_clip_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "manifest.json"
            payload = final_manifest("stage-2")
            del payload["clips"]["cozy"]
            original = json.dumps(payload, sort_keys=True)
            path.write_text(original, encoding="utf-8")
            required = VERIFY_RIG.required_clips_for_variant("stage-2", True)

            with self.assertRaisesRegex(AssertionError, "cozy"):
                VERIFY_RIG.enrich_manifest(
                    path,
                    passing_clips(required),
                    expected_variant="stage-2",
                    required_clips=required,
                )

            self.assertEqual(json.dumps(json.loads(path.read_text()), sort_keys=True), original)

    def test_final_enrichment_rejects_wrong_semantic_loop_and_marker(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "manifest.json"
            payload = final_manifest("stage-2")
            payload["clips"]["sleep"]["loop"] = False
            payload["clips"]["sleep"]["events"] = [
                event for event in payload["clips"]["sleep"]["events"]
                if event["type"] != "sleep_exit"
            ]
            original = json.dumps(payload, sort_keys=True)
            path.write_text(original, encoding="utf-8")
            required = VERIFY_RIG.required_clips_for_variant("stage-2", True)

            with self.assertRaisesRegex(AssertionError, "sleep manifest contract failed"):
                VERIFY_RIG.enrich_manifest(
                    path,
                    passing_clips(required),
                    expected_variant="stage-2",
                    required_clips=required,
                )

            self.assertEqual(json.dumps(json.loads(path.read_text()), sort_keys=True), original)

    def test_final_action_fingerprints_reject_idle_alias_and_duplicate_names(self) -> None:
        reports = {
            name: {
                "motionFingerprint": f"motion-{name}",
                **({"subloopFingerprint": f"subloop-{name}"} if name in {"sleep", "cozy"} else {}),
            }
            for name in VERIFY_RIG.SEMANTIC_REQUIRED_CLIPS
        }
        self.assertEqual(VERIFY_RIG.validate_semantic_fingerprints(reports, idle_fingerprint="idle"), [])

        reports["sad"]["motionFingerprint"] = "idle"
        reports["lamp"]["motionFingerprint"] = reports["read"]["motionFingerprint"]
        reasons = VERIFY_RIG.validate_semantic_fingerprints(reports, idle_fingerprint="idle")

        self.assertTrue(any("sad motion is identical to idle" in reason for reason in reasons))
        self.assertTrue(any("lamp motion is identical to read" in reason for reason in reasons))


if __name__ == "__main__":
    unittest.main()
