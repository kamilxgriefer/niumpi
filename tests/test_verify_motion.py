from __future__ import annotations

import importlib.util
import math
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


REPO = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("verify_motion", REPO / "scripts/niumpi/verify_motion.py")
assert SPEC and SPEC.loader
VERIFY_MOTION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFY_MOTION)


def semantic_manifest_clip(name: str) -> dict:
    spec = VERIFY_MOTION.semantic_contract(name)
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


def passing_semantic_motion(name: str, fingerprint: str | None = None) -> dict:
    spec = VERIFY_MOTION.semantic_contract(name)
    requirements = VERIFY_MOTION.semantic_displacement_for_variant(name, "stage-5", True)
    root = requirements.pop("root")
    regions: dict[str, float] = {}
    for region, amount in requirements.items():
        if region == "arms":
            regions["arm.L"] = amount + 0.01
            regions["arm.R"] = amount + 0.01
        elif region == "oneArm":
            regions["arm.L"] = max(regions.get("arm.L", 0.0), amount + 0.01)
            regions["arm.R"] = max(regions.get("arm.R", 0.0), 0.03)
        else:
            regions[region] = amount + 0.01
    closure = 0.0
    if name == "sleep":
        closure = 0.9
    elif name == "cozy":
        closure = 0.5
    phase = {key: value + 1 if key in {"pulseCount", "silhouetteStates"} else value + 0.01
             for key, value in spec.get("phaseEvidence", {}).items()}
    if name == "roll":
        phase["secondaryMotionSamples"] = 3
    minimums = spec["minimums"]
    return {
        "manifestClip": semantic_manifest_clip(name),
        "rootAlignedDifference": 2.0,
        "rootDisplacementNormalized": root + 0.01,
        "regionalDisplacementNormalized": regions,
        "regionalMotionSampleCounts": {region: 3 for region in regions},
        "rigProof": {
            "animatedControls": [f"control-{index}" for index in range(minimums["controls"])],
            "animatedChannels": [f"channel-{index}" for index in range(minimums["channels"])],
            "regions": [f"region-{index}" for index in range(minimums["regions"])],
            "blinkClosure": closure,
        },
        "phaseEvidence": phase,
        "motionFingerprint": fingerprint or f"motion-{name}",
        "subloopFingerprint": f"subloop-{name}" if "fingerprintRange" in spec else None,
        "subloopMotionNormalized": spec.get("subloopMotion", 0.0) + 0.01,
    }


class MotionTearGateTests(unittest.TestCase):
    def reference_character(self) -> np.ndarray:
        image = np.zeros((512, 512, 4), dtype=np.uint8)
        cv2.ellipse(image, (256, 260), (150, 170), 0, 0, 360, (220, 210, 200, 255), -1)
        cv2.ellipse(image, (256, 460), (100, 18), 0, 0, 360, (50, 30, 80, 150), -1)
        return image

    def test_rootless_shadow_motion_is_not_a_tear(self) -> None:
        reference = self.reference_character()
        candidate = reference.copy()
        candidate[430:, :, :] = 0
        cv2.ellipse(candidate, (310, 475), (100, 18), 0, 0, 360, (50, 30, 80, 150), -1)

        tear = VERIFY_MOTION.central_alpha_tear(reference, candidate)

        self.assertEqual(tear["maxRunPx"], 0)
        self.assertEqual(tear["maxRunRatio"], 0.0)

    def test_partial_horizontal_internal_seam_is_a_tear(self) -> None:
        reference = self.reference_character()
        candidate = reference.copy()
        candidate[300:306, 175:338, :] = 0

        tear = VERIFY_MOTION.central_alpha_tear(reference, candidate)

        self.assertGreater(tear["maxRunRatio"], 0.22)
        self.assertGreaterEqual(tear["maxRunPx"], 24)

    def test_exterior_connected_roll_concavity_is_not_a_tear(self) -> None:
        reference = self.reference_character()
        candidate = reference.copy()
        # A deep channel opened from above is a legal silhouette concavity,
        # even though many of its rows sit between opaque left/right pixels.
        candidate[80:320, 238:274, :] = 0

        tear = VERIFY_MOTION.central_alpha_tear(reference, candidate)

        self.assertEqual(tear["maxRunPx"], 0)
        self.assertEqual(tear["maxRunRatio"], 0.0)

    def test_airborne_tail_and_feet_gap_below_torso_is_not_a_tear(self) -> None:
        reference = self.reference_character()
        candidate = reference.copy()
        candidate[340:364, 150:365, :] = 0
        semantic_regions = {
            "head": (0.20, 0.18, 0.80, 0.62),
            "body": (0.20, 0.50, 0.80, 0.85),
            "tail": (0.50, 0.58, 0.95, 0.98),
            "feet": (0.30, 0.82, 0.72, 0.94),
        }

        tear = VERIFY_MOTION.central_alpha_tear(reference, candidate, semantic_regions)

        self.assertLess(tear["scanY1"], 340)
        self.assertEqual(tear["maxRunPx"], 0)

    def test_semantic_torso_still_catches_known_internal_seam_height(self) -> None:
        reference = self.reference_character()
        candidate = reference.copy()
        candidate[286:292, 175:338, :] = 0
        semantic_regions = {
            "head": (0.20, 0.18, 0.80, 0.62),
            "body": (0.20, 0.50, 0.80, 0.85),
            "tail": (0.50, 0.58, 0.95, 0.98),
            "feet": (0.30, 0.82, 0.72, 0.94),
        }

        tear = VERIFY_MOTION.central_alpha_tear(reference, candidate, semantic_regions)

        self.assertLessEqual(tear["scanY0"], 286)
        self.assertGreater(tear["scanY1"], 292)
        self.assertGreater(tear["maxRunRatio"], 0.22)
        self.assertGreaterEqual(tear["maxRunPx"], 24)


class TransparentCanvasMarginTests(unittest.TestCase):
    def frame(self, inset: int = 8) -> np.ndarray:
        image = np.zeros((64, 64, 4), dtype=np.uint8)
        image[inset:64 - inset, inset:64 - inset] = (180, 220, 240, 255)
        return image

    def test_exact_eight_pixel_margin_passes(self) -> None:
        evidence = VERIFY_MOTION.transparent_canvas_margin([self.frame(8)])

        self.assertEqual(evidence["result"], "PASS")
        self.assertEqual(evidence["minimumMarginPx"], 8)

    def test_seven_pixel_margin_fails(self) -> None:
        evidence = VERIFY_MOTION.transparent_canvas_margin([self.frame(7)])

        self.assertEqual(evidence["result"], "FAIL")
        self.assertEqual(evidence["minimumMarginPx"], 7)

    def test_detached_visible_pixel_participates_in_margin(self) -> None:
        image = self.frame(12)
        image[30, 7] = (255, 255, 255, 9)

        evidence = VERIFY_MOTION.transparent_canvas_margin([image])

        self.assertEqual(evidence["result"], "FAIL")
        self.assertEqual(evidence["sideMarginsPx"]["left"], 7)

    def test_reports_only_bad_frame_in_sequence(self) -> None:
        images = [self.frame(12) for _ in range(7)]
        images[5][3, 24] = (255, 255, 255, 255)

        evidence = VERIFY_MOTION.transparent_canvas_margin(images)

        self.assertEqual(evidence["worstFrame"], 5)
        self.assertEqual(evidence["violationFrames"], [5])
        self.assertEqual(evidence["sideMarginsPx"]["top"], 3)


class AppearanceEdgeGateTests(unittest.TestCase):
    def authored_edges(self) -> np.ndarray:
        edges = np.zeros((192, 192), dtype=np.uint8)
        cv2.ellipse(edges, (96, 108), (62, 68), 0, 0, 360, 1, 1)
        cv2.ellipse(edges, (72, 98), (11, 15), 0, 0, 360, 1, 1)
        cv2.ellipse(edges, (120, 98), (11, 15), 0, 0, 360, 1, 1)
        cv2.ellipse(edges, (96, 126), (24, 12), 0, 10, 170, 1, 1)
        cv2.ellipse(edges, (75, 39), (13, 38), -35, 0, 360, 1, 1)
        cv2.ellipse(edges, (98, 34), (13, 38), 0, 0, 360, 1, 1)
        cv2.ellipse(edges, (121, 39), (13, 38), 35, 0, 360, 1, 1)
        return edges.astype(bool)

    def authored_alpha(self) -> np.ndarray:
        alpha = np.zeros((192, 192), dtype=np.uint8)
        cv2.ellipse(alpha, (96, 108), (62, 68), 0, 0, 360, 1, -1)
        cv2.ellipse(alpha, (75, 39), (13, 38), -35, 0, 360, 1, -1)
        cv2.ellipse(alpha, (98, 34), (13, 38), 0, 0, 360, 1, -1)
        cv2.ellipse(alpha, (121, 39), (13, 38), 35, 0, 360, 1, -1)
        return alpha.astype(bool)

    def boundary(self, alpha: np.ndarray) -> np.ndarray:
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        binary = alpha.astype(np.uint8)
        return (cv2.dilate(binary, kernel) > 0) ^ (cv2.erode(binary, kernel) > 0)

    def hybrid(self, actual: np.ndarray, actual_alpha: np.ndarray) -> dict[str, float | int]:
        reference = self.authored_edges()
        return VERIFY_MOTION.hybrid_tolerance_aware_edge_match(
            reference,
            actual,
            self.boundary(self.authored_alpha()),
            self.boundary(actual_alpha),
            silhouette_tolerance_px=2,
            internal_tolerance_px=3,
        )

    def assert_edge_gate_passes(self, result: dict[str, float | int]) -> None:
        self.assertGreaterEqual(result["precision"], 0.90)
        self.assertGreaterEqual(result["recall"], 0.76)
        self.assertGreaterEqual(result["f1"], 0.82)

    def assert_edge_gate_fails(self, result: dict[str, float | int]) -> None:
        self.assertTrue(
            result["precision"] < 0.90 or result["recall"] < 0.76 or result["f1"] < 0.82,
            result,
        )

    def test_two_pixel_tolerance_accepts_subpixel_resampling_shift(self) -> None:
        reference = self.authored_edges()
        shifted = cv2.warpAffine(
            reference.astype(np.uint8) * 255,
            np.array(((1.0, 0.0, 1.25), (0.0, 1.0, -0.75)), dtype=np.float32),
            (reference.shape[1], reference.shape[0]),
            flags=cv2.INTER_LINEAR,
        ) > 48

        result = VERIFY_MOTION.tolerance_aware_edge_match(reference, shifted, tolerance_px=2)

        self.assertLess(result["rawIoU"], 0.50)
        self.assert_edge_gate_passes(result)

    def test_missing_face_and_leaf_edges_fail_recall(self) -> None:
        reference = self.authored_edges()
        missing_detail = reference.copy()
        missing_detail[:78, :] = False
        missing_detail[78:145, 52:140] = False

        result = VERIFY_MOTION.tolerance_aware_edge_match(reference, missing_detail, tolerance_px=2)

        self.assertLess(result["recall"], 0.76)
        self.assert_edge_gate_fails(result)

    def test_real_geometric_distortion_fails_symmetric_match(self) -> None:
        reference = self.authored_edges()
        squeezed = cv2.resize(reference.astype(np.uint8), (126, 192), interpolation=cv2.INTER_NEAREST)
        distorted = np.zeros_like(reference)
        distorted[:, 33:159] = squeezed.astype(bool)

        result = VERIFY_MOTION.tolerance_aware_edge_match(reference, distorted, tolerance_px=2)

        self.assert_edge_gate_fails(result)

    def test_hybrid_two_three_pixel_metric_accepts_subpixel_shift(self) -> None:
        reference = self.authored_edges()
        alpha = self.authored_alpha()
        transform = np.array(((1.0, 0.0, 1.25), (0.0, 1.0, -0.75)), dtype=np.float32)
        shifted = cv2.warpAffine(
            reference.astype(np.uint8) * 255,
            transform,
            (192, 192),
            flags=cv2.INTER_LINEAR,
        ) > 48
        shifted_alpha = cv2.warpAffine(
            alpha.astype(np.uint8) * 255,
            transform,
            (192, 192),
            flags=cv2.INTER_LINEAR,
        ) > 48

        result = self.hybrid(shifted, shifted_alpha)

        self.assert_edge_gate_passes(result)
        self.assertEqual(result["silhouetteTolerancePx"], 2)
        self.assertEqual(result["internalTolerancePx"], 3)

    def test_hybrid_metric_still_rejects_missing_face_and_leaf_edges(self) -> None:
        missing = self.authored_edges().copy()
        missing[:78, :] = False
        missing[78:145, 52:140] = False

        result = self.hybrid(missing, self.authored_alpha())

        self.assertLess(result["f1"], 0.40)
        self.assert_edge_gate_fails(result)

    def test_hybrid_metric_still_rejects_real_distortion(self) -> None:
        reference = self.authored_edges()
        alpha = self.authored_alpha()
        squeezed_edges = cv2.resize(reference.astype(np.uint8), (126, 192), interpolation=cv2.INTER_NEAREST)
        squeezed_alpha = cv2.resize(alpha.astype(np.uint8), (126, 192), interpolation=cv2.INTER_NEAREST)
        distorted = np.zeros_like(reference)
        distorted_alpha = np.zeros_like(alpha)
        distorted[:, 33:159] = squeezed_edges.astype(bool)
        distorted_alpha[:, 33:159] = squeezed_alpha.astype(bool)

        result = self.hybrid(distorted, distorted_alpha)

        self.assertLess(result["precision"], 0.50)
        self.assertLess(result["f1"], 0.40)
        self.assert_edge_gate_fails(result)

    def test_alpha_silhouette_corruption_still_fails_independent_iou_gate(self) -> None:
        alpha = self.authored_alpha().astype(np.uint8) * 255
        reference = np.zeros((192, 192, 4), dtype=np.uint8)
        reference[..., :3] = (232, 240, 255)
        reference[..., 3] = alpha
        corrupted = reference.copy()
        corrupted[:, 108:, :] = 0
        with tempfile.TemporaryDirectory() as temporary:
            approved = Path(temporary) / "approved.png"
            actual = Path(temporary) / "actual.png"
            Image.fromarray(reference, "RGBA").save(approved)
            Image.fromarray(corrupted, "RGBA").save(actual)

            result = VERIFY_MOTION.appearance_fidelity(actual, approved)

        self.assertLess(result["alphaIoU"], 0.82)
        self.assertEqual(result["result"], "FAIL")
        self.assertTrue(any("silhouette IoU" in reason for reason in result["reasons"]))


class PupilGazeContractTests(unittest.TestCase):
    DIAMETERS = {"pupil.L": 30.0, "pupil.R": 30.0}

    def evaluate(self, left, right, *, bite=10):
        return VERIFY_MOTION.evaluate_pupil_gaze_tracks(
            {"pupil.L": left, "pupil.R": right},
            self.DIAMETERS,
            first_bite_frame=bite,
            expected_direction=(1.0, 0.2),
        )

    def test_zero_and_one_pixel_gaze_fail(self) -> None:
        zero = self.evaluate([(4, 0.0, 0.0)], [(4, 0.0, 0.0)])
        one = self.evaluate([(4, 1.0, 0.0)], [(4, 1.0, 0.0)])

        self.assertEqual(zero["result"], "FAIL")
        self.assertEqual(one["result"], "FAIL")
        self.assertLess(one["perEye"]["pupil.L"]["displacementPerDiameter"], 0.06)

    def test_two_pixels_on_a_thirty_pixel_pupil_passes_in_correct_phase(self) -> None:
        result = self.evaluate([(6, 2.0, 0.4)], [(7, 2.0, 0.4)])

        self.assertEqual(result["result"], "PASS", result)
        self.assertGreater(result["perEye"]["pupil.L"]["displacementPerDiameter"], 0.06)

    def test_wrong_direction_fails_even_with_enough_travel(self) -> None:
        result = self.evaluate([(6, -3.0, -0.6)], [(7, -3.0, -0.6)])

        self.assertEqual(result["result"], "FAIL")
        self.assertTrue(any("direction cosine" in reason for reason in result["reasons"]))

    def test_motion_only_after_first_bite_fails_pre_bite_phase(self) -> None:
        result = self.evaluate([(11, 4.0, 0.8)], [(12, 4.0, 0.8)], bite=10)

        self.assertEqual(result["result"], "FAIL")
        self.assertTrue(any("pre-bite gaze" in reason for reason in result["reasons"]))


class VariantRegionTests(unittest.TestCase):
    def synthetic_variant(self) -> dict:
        return {
            "canvas": {"width": 400, "height": 400},
            "alpha": {
                "bboxPx": {"x": 100, "y": 50, "width": 200, "height": 240},
            },
        }

    def test_approved_bounds_are_mapped_into_offset_render_hull(self) -> None:
        reference = np.zeros((160, 160, 4), dtype=np.uint8)
        reference[30:150, 40:140] = (200, 210, 220, 255)
        approved_head = (120 / 400, 70 / 400, 200 / 400, 130 / 400)

        bounds = VERIFY_MOTION.retarget_approved_bounds(
            reference,
            self.synthetic_variant(),
            approved_head,
        )

        self.assertTrue(
            np.allclose(bounds, (50 / 160, 40 / 160, 90 / 160, 70 / 160), atol=1e-6),
            bounds,
        )

    def test_detached_ornament_does_not_move_main_hull_mapping(self) -> None:
        reference = np.zeros((160, 160, 4), dtype=np.uint8)
        reference[30:150, 40:140] = (200, 210, 220, 255)
        approved_head = (120 / 400, 70 / 400, 200 / 400, 130 / 400)
        expected = VERIFY_MOTION.retarget_approved_bounds(
            reference,
            self.synthetic_variant(),
            approved_head,
        )
        reference[4:10, 150:156] = (255, 255, 255, 255)

        actual = VERIFY_MOTION.retarget_approved_bounds(
            reference,
            self.synthetic_variant(),
            approved_head,
        )

        self.assertTrue(np.allclose(actual, expected, atol=1e-6), (actual, expected))

    def test_all_ten_variants_resolve_normalized_semantic_regions(self) -> None:
        landmarks = VERIFY_MOTION.load_landmarks()

        self.assertEqual(len(landmarks["variants"]), 10)
        for variant_id, variant in landmarks["variants"].items():
            with self.subTest(variant=variant_id):
                regions = VERIFY_MOTION.regions_for_variant(variant, preserve_legacy_baby=False)
                self.assertTrue({"head", "body", "eyes", "feet", "leaf"}.issubset(regions))
                self.assertEqual("arm.L" in regions, bool(variant["topology"]["armsPresent"]))
                for bounds in regions.values():
                    x0, y0, x1, y1 = bounds
                    self.assertLess(x0, x1)
                    self.assertLess(y0, y1)
                    self.assertGreaterEqual(min(bounds), 0.0)
                    self.assertLessEqual(max(bounds), 1.0)


class VariantClipContractTests(unittest.TestCase):
    def test_baby_and_stage_one_require_full_core_eight(self) -> None:
        for variant in ("baby", "stage-1"):
            with self.subTest(variant=variant):
                required = VERIFY_MOTION.required_clips_for_variant(variant)
                self.assertEqual(len(required), 8)
                self.assertIn("hatch_complete", required)

    def test_every_non_baby_variant_requires_core_seven_without_hatch(self) -> None:
        landmarks = VERIFY_MOTION.load_landmarks()
        for variant in landmarks["variants"]:
            if variant == "stage-1":
                continue
            with self.subTest(variant=variant):
                required = VERIFY_MOTION.required_clips_for_variant(variant)
                self.assertEqual(len(required), 7)
                self.assertNotIn("hatch_complete", required)

    def test_non_baby_ignores_missing_hatch_but_not_a_missing_required_clip(self) -> None:
        required = VERIFY_MOTION.required_clips_for_variant("stage-5")
        manifest_clips = {name: {} for name in required}

        self.assertEqual([name for name in required if name not in manifest_clips], [])
        del manifest_clips["eat"]
        self.assertEqual([name for name in required if name not in manifest_clips], ["eat"])

    def test_final_mode_adds_nine_semantic_clips_without_changing_core_default(self) -> None:
        self.assertEqual(len(VERIFY_MOTION.required_clips_for_variant("baby")), 8)
        self.assertEqual(len(VERIFY_MOTION.required_clips_for_variant("stage-5")), 7)

        baby_final = VERIFY_MOTION.required_clips_for_variant("baby", True)
        stage_final = VERIFY_MOTION.required_clips_for_variant("stage-5", True)

        self.assertEqual(len(baby_final), 17)
        self.assertEqual(len(stage_final), 16)
        self.assertTrue(set(VERIFY_MOTION.SEMANTIC_REQUIRED_CLIPS).issubset(baby_final))
        self.assertNotIn("hatch_complete", stage_final)

    def test_all_ten_anatomies_resolve_semantic_displacement_topology(self) -> None:
        landmarks = VERIFY_MOTION.load_landmarks()
        for approved_id, profile in landmarks["variants"].items():
            variant = "baby" if approved_id == "stage-1" else approved_id
            arms_present = bool(profile["topology"]["armsPresent"])
            for name in VERIFY_MOTION.SEMANTIC_REQUIRED_CLIPS:
                with self.subTest(variant=variant, clip=name):
                    requirements = VERIFY_MOTION.semantic_displacement_for_variant(
                        name,
                        variant,
                        arms_present,
                    )
                    self.assertEqual("arms" in requirements, arms_present)
                    self.assertEqual("oneArm" in requirements, arms_present and name == "lamp")
                    expects_tail = variant == "mistwander" and bool(VERIFY_MOTION.semantic_contract(name).get("tail"))
                    self.assertEqual("tail" in requirements, expects_tail)
                    expects_accessory = (
                        variant in VERIFY_MOTION.ROUTE_FORM_VARIANTS
                        and bool(VERIFY_MOTION.semantic_contract(name).get("routeAccessory"))
                    )
                    self.assertEqual("accessory" in requirements, expects_accessory)


class SemanticCentroidTrajectoryTests(unittest.TestCase):
    REGION = (36 / 128, 44 / 128, 84 / 128, 84 / 128)

    def internal_feature_frame(self, shift: int = 0) -> np.ndarray:
        image = np.zeros((128, 128, 4), dtype=np.uint8)
        cv2.ellipse(image, (64, 68), (42, 48), 0, 0, 360, (210, 180, 150, 255), -1)
        cv2.rectangle(image, (48 + shift, 56), (59 + shift, 67), (25, 35, 75, 255), -1)
        return image

    def trajectory(self, moved_frames: set[int]) -> dict:
        images = [
            self.internal_feature_frame(10 if frame in moved_frames else 0)
            for frame in range(12)
        ]
        return VERIFY_MOTION.semantic_motion_trajectory(
            images,
            {"pupils": self.REGION},
            96.0,
        )

    def test_one_frame_spike_reaches_peak_but_has_only_one_sample(self) -> None:
        result = self.trajectory({6})

        self.assertGreater(result["regions"]["pupils"], 0.005)
        self.assertEqual(result["regionalMotionSampleCounts"]["pupils"], 1)

    def test_three_meaningful_samples_are_retained(self) -> None:
        result = self.trajectory({3, 6, 9})

        self.assertGreater(result["regions"]["pupils"], 0.005)
        self.assertEqual(result["regionalMotionSampleCounts"]["pupils"], 3)


class RollSecondaryMotionTests(unittest.TestCase):
    REGIONS = {
        "body": (0.24, 0.28, 0.76, 0.72),
        "feet": (0.27, 0.65, 0.73, 0.88),
        "leaf": (0.38, 0.07, 0.66, 0.36),
    }

    def local_pose(self, secondary: float = 0.0) -> np.ndarray:
        image = np.zeros((192, 192, 4), dtype=np.uint8)
        # The off-centre lobe makes four root orientations visually distinct.
        cv2.ellipse(image, (96, 105), (48, 55), 0, 0, 360, (225, 150, 105, 255), -1)
        cv2.circle(image, (132, 91), 13, (238, 168, 115, 255), -1)
        cv2.ellipse(
            image,
            (88 + int(round(secondary)), 51 - int(round(secondary))),
            (14, 30),
            -22,
            0,
            360,
            (90, 205, 180, 255),
            -1,
        )
        foot_shift = int(round(-secondary))
        cv2.ellipse(image, (74 + foot_shift, 154), (20, 12), 0, 0, 360, (205, 105, 70, 255), -1)
        cv2.ellipse(image, (119 + foot_shift, 154), (20, 12), 0, 0, 360, (205, 105, 70, 255), -1)
        cv2.circle(image, (78, 96), 7, (35, 30, 75, 255), -1)
        cv2.circle(image, (117, 92), 5, (35, 30, 75, 255), -1)
        return image

    def sequence(self, with_secondary: bool) -> list[np.ndarray]:
        frames: list[np.ndarray] = []
        for frame in range(60):
            progress = min(1.0, max(0.0, (frame - 8) / 36.0))
            angle = 360.0 * progress
            secondary = 0.0
            if with_secondary and 8 <= frame < 44:
                secondary = 30.0 * math.sin((frame - 8) / 36.0 * math.pi * 3.0)
            local = self.local_pose(secondary)
            matrix = cv2.getRotationMatrix2D((96, 105), angle, 1.0)
            frames.append(
                cv2.warpAffine(
                    local,
                    matrix,
                    (192, 192),
                    flags=cv2.INTER_LINEAR,
                    borderMode=cv2.BORDER_CONSTANT,
                    borderValue=(0, 0, 0, 0),
                )
            )
        return frames

    def test_flat_root_rotated_composite_has_no_secondary_roll(self) -> None:
        evidence = VERIFY_MOTION.semantic_phase_evidence(
            "roll",
            self.sequence(False),
            self.REGIONS,
            110.0,
        )

        self.assertGreaterEqual(evidence["silhouetteStates"], 4)
        self.assertLess(evidence["secondaryMotionSamples"], 3)

    def test_true_leaf_and_feet_follow_through_has_three_samples(self) -> None:
        evidence = VERIFY_MOTION.semantic_phase_evidence(
            "roll",
            self.sequence(True),
            self.REGIONS,
            110.0,
        )

        self.assertGreaterEqual(evidence["secondaryMotionSamples"], 3)


class SemanticFinalGateTests(unittest.TestCase):
    def test_nine_unique_authored_semantic_results_pass(self) -> None:
        reports = {}
        for name in VERIFY_MOTION.SEMANTIC_REQUIRED_CLIPS:
            with self.subTest(clip=name):
                result = passing_semantic_motion(name)
                reasons = VERIFY_MOTION.validate_semantic_motion_result(
                    name,
                    result,
                    variant="stage-5",
                    arms_present=True,
                )
                self.assertEqual(reasons, [])
                reports[name] = result

        self.assertEqual(
            VERIFY_MOTION.validate_semantic_fingerprints(reports, idle_fingerprint="motion-idle"),
            [],
        )

    def test_renamed_idle_and_duplicate_semantic_motion_fail(self) -> None:
        reports = {name: passing_semantic_motion(name) for name in VERIFY_MOTION.SEMANTIC_REQUIRED_CLIPS}
        reports["sad"]["motionFingerprint"] = "motion-idle"
        reports["lamp"]["motionFingerprint"] = reports["read"]["motionFingerprint"]

        reasons = VERIFY_MOTION.validate_semantic_fingerprints(reports, idle_fingerprint="motion-idle")

        self.assertTrue(any("sad motion is identical to idle" in reason for reason in reasons))
        self.assertTrue(any("lamp motion is identical to read" in reason for reason in reasons))

    def test_missing_semantic_clip_is_a_final_mode_failure(self) -> None:
        required = VERIFY_MOTION.required_clips_for_variant("stage-2", True)
        manifest_clips = {name: {} for name in required if name != "cozy"}

        missing = [name for name in required if name not in manifest_clips]

        self.assertEqual(missing, ["cozy"])

    def test_wrong_sleep_loop_or_marker_fails_metadata(self) -> None:
        clip = semantic_manifest_clip("sleep")
        clip["loop"] = False
        clip["loopRange"] = {"startFrame": 0, "endFrameExclusive": 112}
        clip["events"] = [event for event in clip["events"] if event["type"] != "sleep_exit"]

        reasons = VERIFY_MOTION.validate_semantic_clip_metadata("sleep", clip)

        self.assertTrue(any("loop False" in reason for reason in reasons))
        self.assertTrue(any("loopRange" in reason for reason in reasons))
        self.assertTrue(any("sleep_exit@96" in reason for reason in reasons))

    def test_sleep_and_cozy_need_real_subloop_motion(self) -> None:
        for name in ("sleep", "cozy"):
            with self.subTest(clip=name):
                result = passing_semantic_motion(name)
                result["subloopFingerprint"] = ""
                result["subloopMotionNormalized"] = 0.0

                reasons = VERIFY_MOTION.validate_semantic_motion_result(
                    name,
                    result,
                    variant="stage-5",
                    arms_present=True,
                )

                self.assertTrue(any("subloop fingerprint" in reason for reason in reasons))
                self.assertTrue(any("subloop motion/H" in reason for reason in reasons))

    def test_activity_specific_region_and_phase_gates_do_not_accept_generic_motion(self) -> None:
        cases = {
            "travel": ("phaseEvidence", "apex"),
            "sing": ("regionalDisplacementNormalized", "mouth"),
            "read": ("regionalDisplacementNormalized", "pupils"),
            "lamp": ("regionalDisplacementNormalized", "arm.L"),
            "roll": ("phaseEvidence", "silhouetteStates"),
        }
        for name, (group, field) in cases.items():
            with self.subTest(clip=name):
                result = passing_semantic_motion(name)
                result[group][field] = 0.0

                reasons = VERIFY_MOTION.validate_semantic_motion_result(
                    name,
                    result,
                    variant="stage-5",
                    arms_present=True,
                )

                self.assertTrue(reasons, f"{name} incorrectly accepted missing {field}")

    def test_one_frame_spike_does_not_satisfy_three_sample_contract(self) -> None:
        result = passing_semantic_motion("read")
        result["regionalMotionSampleCounts"]["pupils"] = 1

        reasons = VERIFY_MOTION.validate_semantic_motion_result(
            "read",
            result,
            variant="stage-5",
            arms_present=True,
        )

        self.assertTrue(any("pupils meaningful motion samples 1 < 3" in reason for reason in reasons))


class AtlasQualityGateTests(unittest.TestCase):
    def fixture(self, directory: Path, quality: int) -> tuple[dict, list[Path]]:
        size = 128
        yy, xx = np.indices((size, size))
        alpha = np.where(((xx - 64) ** 2 + (yy - 64) ** 2) < 55**2, 255, 0).astype(np.uint8)
        rgb = np.stack(
            (
                128 + 80 * np.sin(xx / 8),
                128 + 70 * np.sin(yy / 10),
                128 + 60 * np.sin((xx + yy) / 12),
            ),
            axis=-1,
        ).clip(0, 255).astype(np.uint8)
        pixels = np.dstack((rgb, alpha))
        source = directory / "source.png"
        atlas = directory / f"q{quality}.webp"
        Image.fromarray(pixels, mode="RGBA").save(source)
        Image.fromarray(pixels, mode="RGBA").save(atlas, "WEBP", quality=quality, method=6)
        clip = {
            "atlas": {"pages": [{"src": f"/{atlas.name}"}]},
            "frames": [{"page": 0, "x": 0, "y": 0, "w": size, "h": size}],
        }
        return clip, [source]

    def fixture_v3(self, directory: Path) -> tuple[dict, list[Path], dict[str, int]]:
        size = 128
        yy, xx = np.indices((size, size))
        alpha = np.where(
            (((xx - 66) / 38) ** 2 + ((yy - 70) / 45) ** 2) < 1,
            255,
            0,
        ).astype(np.uint8)
        rgb = np.stack(
            (
                128 + 80 * np.sin(xx / 8),
                128 + 70 * np.sin(yy / 10),
                128 + 60 * np.sin((xx + yy) / 12),
            ),
            axis=-1,
        ).clip(0, 255).astype(np.uint8)
        pixels = np.dstack((rgb, alpha))
        source = directory / "source-v3.png"
        Image.fromarray(pixels, mode="RGBA").save(source)

        y_positions, x_positions = np.nonzero(alpha)
        x0, x1 = int(x_positions.min()), int(x_positions.max()) + 1
        y0, y1 = int(y_positions.min()), int(y_positions.max()) + 1
        crop = pixels[y0:y1, x0:x1]
        page = np.zeros((crop.shape[0] + 8, crop.shape[1] + 8, 4), dtype=np.uint8)
        page[4 : 4 + crop.shape[0], 4 : 4 + crop.shape[1]] = crop
        atlas = directory / "trimmed-lossless.webp"
        Image.fromarray(page, mode="RGBA").save(
            atlas,
            "WEBP",
            lossless=True,
            exact=True,
            method=6,
        )
        clip = {
            "atlas": {"pages": [{"src": f"/{atlas.name}"}]},
            "frames": [
                {
                    "page": 0,
                    "x": 4,
                    "y": 4,
                    "w": int(crop.shape[1]),
                    "h": int(crop.shape[0]),
                    "offsetX": x0,
                    "offsetY": y0,
                }
            ],
            "encoding": {
                "format": "WebP",
                "rgb": {
                    "lossy": False,
                    "quality": None,
                    "foregroundMAE": 0.0,
                    "foregroundPSNR": None,
                },
                "alpha": {"lossless": True, "meanAbsoluteError": 0.0},
                "thresholds": {
                    "foregroundMAEMax": 2.5,
                    "foregroundPSNRMin": 38.0,
                    "alphaMAE": 0.0,
                },
                "selection": {
                    "strategy": "lossless-fallback",
                    "claim": "declared-candidates-exhausted",
                    "candidateQualities": [100],
                    "selectedQuality": None,
                    "evaluatedQualities": [100],
                    "candidateProofs": [{
                        "quality": 100,
                        "passes": False,
                        "foregroundMAE": 2.6,
                        "foregroundPSNR": 37.9,
                        "alphaMAE": 0.0,
                        "failingFrames": [0],
                    }],
                    "predecessor": {
                        "quality": 100,
                        "passes": False,
                        "foregroundMAE": 2.6,
                        "foregroundPSNR": 37.9,
                        "alphaMAE": 0.0,
                        "failingFrames": [0],
                    },
                },
                "frameGate": {
                    "foregroundAlpha": ">0",
                    "allFramesPassed": True,
                    "frames": [{
                        "index": 0,
                        "passes": True,
                        "foregroundMAE": 0.0,
                        "foregroundPSNR": None,
                        "alphaMAE": 0.0,
                    }],
                },
            },
        }
        return clip, [source], {"width": size, "height": size}

    def test_q92_rgb_with_lossless_alpha_passes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            clip, sources = self.fixture(root, 92)

            result = VERIFY_MOTION.atlas_gate(clip, sources, root)

            self.assertEqual(result["result"], "PASS", result["reasons"])
            self.assertEqual(result["alphaMAE"], 0.0)
            self.assertLessEqual(result["foregroundRGBMAE"], 2.5)
            self.assertGreaterEqual(result["foregroundRGBPSNR"], 38.0)
            self.assertEqual(result["frameEvidence"][0]["frame"], 0)
            self.assertGreater(result["frameEvidence"][0]["foregroundPixels"], 0)

    def test_schema_three_reconstructs_trimmed_frame_on_logical_canvas(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            clip, sources, canvas = self.fixture_v3(root)

            result = VERIFY_MOTION.atlas_gate(
                clip,
                sources,
                root,
                schema_version=3,
                canvas=canvas,
            )

            self.assertEqual(result["result"], "PASS", result["reasons"])
            self.assertEqual(result["alphaMAE"], 0.0)
            self.assertEqual(result["foregroundRGBMAE"], 0.0)
            self.assertEqual(result["foregroundRGBPSNR"], "inf")

    def test_schema_three_wrong_offset_fails_full_canvas_alpha_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            clip, sources, canvas = self.fixture_v3(root)
            clip["frames"][0]["offsetX"] += 3

            result = VERIFY_MOTION.atlas_gate(
                clip,
                sources,
                root,
                schema_version=3,
                canvas=canvas,
            )

            self.assertEqual(result["result"], "FAIL")
            self.assertGreater(result["frameEvidence"][0]["alphaMAE"], 0.0)
            self.assertTrue(any("alpha MAE" in reason for reason in result["reasons"]))

    def test_schema_three_rejects_crop_that_overflows_logical_canvas(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            clip, sources, canvas = self.fixture_v3(root)
            clip["frames"][0]["offsetX"] = canvas["width"]

            result = VERIFY_MOTION.atlas_gate(
                clip,
                sources,
                root,
                schema_version=3,
                canvas=canvas,
            )

            self.assertEqual(result["result"], "FAIL")
            self.assertTrue(any("logical canvas" in reason for reason in result["reasons"]))

    def test_schema_three_checks_every_frame_and_rejects_one_bad_tail_frame(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            clip, sources, canvas = self.fixture_v3(root)
            original_source = Image.open(sources[0]).convert("RGBA")
            pages = []
            frames = []
            expanded_sources = []
            for index in range(6):
                path = root / f"source-v3-{index}.png"
                image = original_source.copy()
                if index == 5:
                    pixels = np.asarray(image).copy()
                    foreground = pixels[..., 3] > 0
                    pixels[..., :3][foreground] = 0
                    image = Image.fromarray(pixels, mode="RGBA")
                image.save(path)
                expanded_sources.append(path)
                pages.append(dict(clip["atlas"]["pages"][0]))
                frames.append(dict(clip["frames"][0], page=index))
            clip["atlas"]["pages"] = pages
            clip["frames"] = frames
            clip["encoding"]["frameGate"]["frames"] = [
                dict(clip["encoding"]["frameGate"]["frames"][0], index=index)
                for index in range(6)
            ]

            result = VERIFY_MOTION.atlas_gate(
                clip,
                expanded_sources,
                root,
                schema_version=3,
                canvas=canvas,
            )

            self.assertEqual(result["sampledFrames"], list(range(6)))
            self.assertEqual(result["result"], "FAIL")
            self.assertTrue(any("frame 5 foreground RGB" in reason for reason in result["reasons"]))

    def test_schema_three_rejects_forged_candidate_predecessor(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            clip, sources, canvas = self.fixture_v3(root)
            clip["encoding"]["selection"]["predecessor"]["passes"] = True

            result = VERIFY_MOTION.atlas_gate(
                clip,
                sources,
                root,
                schema_version=3,
                canvas=canvas,
            )

            self.assertEqual(result["result"], "FAIL")
            self.assertTrue(any("predecessor" in reason for reason in result["reasons"]))

    def test_bad_rgb_quality_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            clip, sources = self.fixture(root, 40)

            result = VERIFY_MOTION.atlas_gate(clip, sources, root)

            self.assertEqual(result["result"], "FAIL")
            self.assertTrue(any("RGB MAE" in reason or "PSNR" in reason for reason in result["reasons"]))
            self.assertEqual(len(result["frameEvidence"]), 1)
            self.assertTrue(
                result["frameEvidence"][0]["foregroundRGBMAE"] > 2.5
                or result["frameEvidence"][0]["foregroundRGBPSNR"] < 38.0
            )

    def test_repeated_rectangles_still_fail(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            clip, sources = self.fixture(root, 92)
            clip["frames"].append(dict(clip["frames"][0], index=1))
            sources.append(sources[0])

            result = VERIFY_MOTION.atlas_gate(clip, sources, root)

            self.assertEqual(result["result"], "FAIL")
            self.assertIn("atlas repeats a source rectangle", result["reasons"])

    def test_missing_page_still_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            clip, sources = self.fixture(root, 92)
            clip["atlas"]["pages"][0]["src"] = "/not-there.webp"

            result = VERIFY_MOTION.atlas_gate(clip, sources, root)

            self.assertEqual(result["result"], "FAIL")
            self.assertTrue(any("missing atlas page" in reason for reason in result["reasons"]))


if __name__ == "__main__":
    unittest.main()
