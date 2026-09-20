"""DTW-based temporal alignment — docs/architecture.md §3.6. This is the
first pipeline stage that needs the FastAPI round-trip, since dtaidistance
is a Python-only dependency; everything through M4 ran entirely client-
side.

Alignment runs on joint/segment ANGLES (degrees), not raw landmark
positions — angles are already scale/camera-distance invariant (computed
with aspect-ratio-correct pixel math back in build-sequence.ts), so two
recordings shot from slightly different distances or framings still align
correctly. DTW is windowed (Sakoe-Chiba band) and phase-seeded: it never
runs across the whole clip at once, only within each pair of phases with
the same name in `before` and `after` — this is what keeps "before
release" aligned with "after release" rather than an arbitrary
equal-cost frame, and avoids the pathological/degenerate warps
unconstrained DTW is prone to (see docs/research.md §5).
"""
from __future__ import annotations

import math

import numpy as np
from dtaidistance import dtw_ndim

from .models import AlignmentMap, AlignmentParams, MotionSequence, PhaseAlignment

DEFAULT_SAKOE_CHIBA_RATIO = 0.4


def _feature_keys(
    before: MotionSequence,
    after: MotionSequence,
    before_range: tuple[int, int],
    after_range: tuple[int, int],
) -> list[str]:
    """Angle keys present in either sequence's matched phase window, so a
    key only one side computed for (e.g. a joint one clip's framing cut
    off) doesn't just silently disappear from the feature space."""
    keys: set[str] = set()
    for seq, (start, end) in ((before, before_range), (after, after_range)):
        for frame in seq.joint_angles[start : end + 1]:
            keys.update(frame.angles.keys())
        for frame in seq.segment_angles[start : end + 1]:
            keys.update(frame.angles.keys())
    return sorted(keys)


def _feature_matrix(
    sequence: MotionSequence, keys: list[str], start: int, end: int
) -> np.ndarray:
    """(frames x features) matrix of angle values for frames [start, end].
    A feature missing for a given frame (angle not computed that frame,
    e.g. brief occlusion) defaults to 0.0 rather than dropping the frame —
    DTW needs a fixed-width vector per frame."""
    joint_by_frame = {f.frame_index: f.angles for f in sequence.joint_angles}
    segment_by_frame = {f.frame_index: f.angles for f in sequence.segment_angles}

    rows = []
    for frame_index in range(start, end + 1):
        angles = {
            **joint_by_frame.get(frame_index, {}),
            **segment_by_frame.get(frame_index, {}),
        }
        rows.append([angles.get(k, 0.0) for k in keys])
    return np.array(rows, dtype=np.float64)


def align_motion_sequences(
    before: MotionSequence,
    after: MotionSequence,
    sakoe_chiba_ratio: float = DEFAULT_SAKOE_CHIBA_RATIO,
) -> AlignmentMap:
    before_phases = {p.name: p for p in before.phases}
    after_phases = {p.name: p for p in after.phases}
    matched_names = [name for name in before_phases if name in after_phases]

    frame_map: dict[int, int] = {}
    phase_alignment: list[PhaseAlignment] = []
    max_window = 1

    for name in matched_names:
        bp = before_phases[name]
        ap = after_phases[name]
        before_range = (bp.start_frame, bp.end_frame)
        after_range = (ap.start_frame, ap.end_frame)

        keys = _feature_keys(before, after, before_range, after_range)
        if not keys:
            continue  # neither sequence computed any angle during this phase

        before_matrix = _feature_matrix(before, keys, *before_range)
        after_matrix = _feature_matrix(after, keys, *after_range)
        if before_matrix.shape[0] == 0 or after_matrix.shape[0] == 0:
            continue

        window = max(
            1,
            math.ceil(sakoe_chiba_ratio * max(before_matrix.shape[0], after_matrix.shape[0])),
        )
        max_window = max(max_window, window)

        path = dtw_ndim.warping_path(before_matrix, after_matrix, window=window)

        # A warping path can map one before-frame to several after-frames
        # (or vice versa) through a plateau; frame_map is a proper
        # function (one after-frame per before-frame) per the schema, so
        # later matches for the same before-frame simply win — an
        # arbitrary but consistent tie-break, not a correctness issue.
        for local_before_idx, local_after_idx in path:
            frame_map[bp.start_frame + local_before_idx] = ap.start_frame + local_after_idx

        phase_alignment.append(
            PhaseAlignment(phase_name=name, before_range=before_range, after_range=after_range)
        )

    return AlignmentMap(
        before_sequence_id=before.id,
        after_sequence_id=after.id,
        frame_map=frame_map,
        phase_alignment=phase_alignment,
        method="dtw_windowed_phase_seeded",
        # Reports the largest window used across all matched phases (each
        # phase gets its own window sized to its own length) as a single
        # summary value — descriptive metadata, not used to re-run alignment.
        params=AlignmentParams(sakoe_chiba_radius=max_window, feature_space="joint_angles"),
    )
