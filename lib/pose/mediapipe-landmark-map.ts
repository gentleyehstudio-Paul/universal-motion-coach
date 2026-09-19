import type { CommonJointId } from "./types";

// MediaPipe Pose Landmarker's 33-point index -> our CommonJointId.
// https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
// Landmarks with no CommonJointId equivalent (eyes inner/outer, mouth,
// pinky/index/thumb) are intentionally omitted — they're not used by any
// MotionTemplate today, and can be added without touching this file's
// callers since Partial<Record<...>> already tolerates missing joints.
export const MEDIAPIPE_LANDMARK_MAP: Partial<Record<number, CommonJointId>> = {
  0: "nose",
  2: "left_eye",
  5: "right_eye",
  7: "left_ear",
  8: "right_ear",
  11: "left_shoulder",
  12: "right_shoulder",
  13: "left_elbow",
  14: "right_elbow",
  15: "left_wrist",
  16: "right_wrist",
  23: "left_hip",
  24: "right_hip",
  25: "left_knee",
  26: "right_knee",
  27: "left_ankle",
  28: "right_ankle",
  29: "left_heel",
  30: "right_heel",
  31: "left_foot_index",
  32: "right_foot_index",
};
