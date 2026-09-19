import type { CommonJointId } from "../pose/types";

/** Each entry: angle at `vertex`, formed by rays toward `from` and `to`.
 * Pose-engine-agnostic (keyed by CommonJointId) and sport-agnostic — a
 * MotionTemplate's `relevantAngles` selects a subset of these keys, it
 * doesn't define new geometry. Add a joint angle here once; every sport
 * that lists its key in relevantAngles gets it for free. */
export const JOINT_ANGLE_DEFS: Record<
  string,
  { from: CommonJointId; vertex: CommonJointId; to: CommonJointId }
> = {
  left_knee_flexion: { from: "left_hip", vertex: "left_knee", to: "left_ankle" },
  right_knee_flexion: { from: "right_hip", vertex: "right_knee", to: "right_ankle" },
  left_elbow_flexion: { from: "left_shoulder", vertex: "left_elbow", to: "left_wrist" },
  right_elbow_flexion: { from: "right_shoulder", vertex: "right_elbow", to: "right_wrist" },
  left_hip_flexion: { from: "left_shoulder", vertex: "left_hip", to: "left_knee" },
  right_hip_flexion: { from: "right_shoulder", vertex: "right_hip", to: "right_knee" },
};
