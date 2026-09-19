// Mirrors docs/data-model.md. These types are the contract that crosses
// the Next.js <-> FastAPI boundary once a backend round-trip is needed
// (M5+); for M1-M4 they are produced and consumed entirely client-side.
import type { CommonJointId, CommonSkeletonFrame } from "../pose/types";

export interface Point2D {
  x: number;
  y: number;
}

export interface JointAngleFrame {
  frameIndex: number;
  angles: Partial<Record<string, number>>;
}

export interface SegmentAngleFrame {
  frameIndex: number;
  angles: Partial<Record<string, number>>;
}

export interface JointVelocityFrame {
  frameIndex: number;
  velocities: Partial<Record<CommonJointId, { vx: number; vy: number; speed: number }>>;
}

export interface JointAccelerationFrame {
  frameIndex: number;
  accelerations: Partial<Record<CommonJointId, { ax: number; ay: number }>>;
}

export type MovementDirection =
  | "left"
  | "right"
  | "toward_camera"
  | "away_from_camera"
  | "unknown";

export interface MotionSequence {
  id: string;
  sourceVideoRef: string | null;
  poseProvider: { name: string; version: string; has3D: boolean };
  fps: number;
  duration: number;
  frameCount: number;

  landmarks: CommonSkeletonFrame[];
  jointAngles: JointAngleFrame[];
  segmentAngles: SegmentAngleFrame[];
  velocities: JointVelocityFrame[];
  accelerations: JointAccelerationFrame[] | null;

  bodyCenter: Point2D[];
  hipCenter: Point2D[];
  shoulderCenter: Point2D[];
  torsoAngle: number[];
  movementDirection: MovementDirection;

  phases: DetectedPhase[];
  confidence: number[];

  normalization: {
    anchor: "hip" | "torso" | "foot" | string;
    scaleReference: "shoulder_hip_distance" | string;
    scaleValuePx: number;
  };
}

export interface DetectedPhase {
  name: string;
  startFrame: number;
  endFrame: number;
  confidence: number;
}

export type QualityDimension =
  | "alignment"
  | "symmetry"
  | "stability"
  | "coordination"
  | "tempo"
  | "completeness";

export interface Finding {
  issueId: string;
  qualityDimension: QualityDimension;
  phase: string;
  confidence: number;
  measuredValue: number;
  baselineValue: number;
  unit: "degrees" | "seconds" | "ratio" | "normalized_distance";
  severity: "mild" | "moderate" | "severe";
  baselineSource:
    | "template_default"
    | "biomechanical_rule"
    | "user_baseline"
    | "user_history";
}

export interface Correction {
  findingId: string;
  what: string;
  when: string;
  why: string;
  whatToChange: string;
  cue: string;
  drill: string;
}
