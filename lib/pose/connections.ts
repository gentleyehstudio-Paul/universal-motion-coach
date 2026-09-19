import type { CommonJointId } from "./types";

// Bone connections for skeleton rendering. Deliberately independent of any
// MotionTemplate — every provider/sport draws the same rig; a template
// only chooses which joints/angles matter for analysis, not how to draw.
export const SKELETON_CONNECTIONS: [CommonJointId, CommonJointId][] = [
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"],
  ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"],
  ["left_ankle", "left_heel"],
  ["left_ankle", "left_foot_index"],
  ["right_hip", "right_knee"],
  ["right_knee", "right_ankle"],
  ["right_ankle", "right_heel"],
  ["right_ankle", "right_foot_index"],
  ["left_ear", "left_eye"],
  ["right_ear", "right_eye"],
  ["left_eye", "nose"],
  ["right_eye", "nose"],
];
