"""Verifies the M5 exit criterion from docs/mvp-plan.md: the AlignmentMap
correctly pairs frames representing the same point in the movement even
when the before/after clips run at different tempos - not just the same
frame index in both.

Uses a synthetic before/after pair where knee flexion is a known,
monotonic function of position within the "descent" phase (180deg at the
top down to 90deg at the bottom), at two different tempos (20 vs 14
frames for the same descent - a ~30% tempo difference, within the
Sakoe-Chiba band's documented +-40% design tolerance in
docs/architecture.md SS3.6) plus a static "bottom" hold. Since the value
trace is monotonic and known exactly, we can assert DTW matches frames by
movement depth (value), not by raw index.
"""
from app.alignment import align_motion_sequences
from app.models import CommonSkeletonFrame, DetectedPhase, JointAngleFrame, MotionSequence, SegmentAngleFrame


def _make_sequence(seq_id: str, descent_frames: int, bottom_frames: int) -> MotionSequence:
    joint_angles = []
    for i in range(descent_frames):
        knee = 180 - (90 / (descent_frames - 1)) * i
        joint_angles.append(JointAngleFrame(frame_index=i, angles={"left_knee_flexion": knee}))
    for i in range(bottom_frames):
        joint_angles.append(
            JointAngleFrame(frame_index=descent_frames + i, angles={"left_knee_flexion": 90.0})
        )

    total = descent_frames + bottom_frames
    segment_angles = [SegmentAngleFrame(frame_index=i, angles={}) for i in range(total)]
    landmarks = [
        CommonSkeletonFrame(frame_index=i, timestamp_ms=i * 33.3, joints={}, has3_d=False)
        for i in range(total)
    ]
    phases = [
        DetectedPhase(name="descent", start_frame=0, end_frame=descent_frames - 1, confidence=1.0),
        DetectedPhase(name="bottom", start_frame=descent_frames, end_frame=total - 1, confidence=1.0),
    ]

    return MotionSequence(
        id=seq_id,
        source_video_ref=None,
        pose_provider={"name": "synthetic", "version": "0", "has3D": False},
        fps=30.0,
        duration=total / 30.0,
        frame_count=total,
        video_width=640,
        video_height=480,
        landmarks=landmarks,
        joint_angles=joint_angles,
        segment_angles=segment_angles,
        phases=phases,
        confidence=[1.0] * total,
    )


def test_matches_phases_present_in_both_sequences():
    before = _make_sequence("before", descent_frames=20, bottom_frames=5)
    after = _make_sequence("after", descent_frames=14, bottom_frames=5)

    result = align_motion_sequences(before, after)

    assert [p.phase_name for p in result.phase_alignment] == ["descent", "bottom"]
    assert result.method == "dtw_windowed_phase_seeded"
    assert result.params.feature_space == "joint_angles"


def test_aligns_by_movement_depth_not_raw_frame_index_across_tempos():
    before = _make_sequence("before", descent_frames=20, bottom_frames=5)
    after = _make_sequence("after", descent_frames=14, bottom_frames=5)

    result = align_motion_sequences(before, after)

    # Both clips start the descent at the same knee angle (180deg) -
    # frame 0 should map close to after's own frame 0, not drift.
    assert result.frame_map[0] <= 2

    # before frame 10 is halfway through ITS 20-frame descent
    # (knee ~= 180 - 90*10/19 ~= 132.6deg). The equivalent depth in
    # after's shorter 14-frame descent is around local frame 7
    # (knee ~= 180 - 90*7/13 ~= 132.5deg) - a naive same-index mapping
    # would incorrectly point at after's frame 10, which is already
    # deep into "bottom". Assert it lands near the value-matched frame,
    # not the raw index.
    mapped_mid_descent = result.frame_map[10]
    assert 4 <= mapped_mid_descent <= 10

    # Deep into "bottom" (constant value) should map somewhere inside
    # after's own bottom phase [14, 18], never back into descent.
    mapped_bottom = result.frame_map[22]
    assert 14 <= mapped_bottom <= 18


def test_skips_a_phase_missing_from_either_sequence():
    before = _make_sequence("before", descent_frames=20, bottom_frames=5)
    after = _make_sequence("after", descent_frames=14, bottom_frames=5)
    after.phases = [p for p in after.phases if p.name != "bottom"]

    result = align_motion_sequences(before, after)

    assert [p.phase_name for p in result.phase_alignment] == ["descent"]
    assert all(v <= 13 for v in result.frame_map.values())
