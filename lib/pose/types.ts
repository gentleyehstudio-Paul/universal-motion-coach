// Pose-provider-agnostic types. Every PoseProvider implementation maps its
// native output into these shapes before anything else in the system sees
// it. See docs/data-model.md §1 and docs/architecture.md §3.1.

export type CommonJointId =
  | "nose"
  | "left_eye"
  | "right_eye"
  | "left_ear"
  | "right_ear"
  | "left_shoulder"
  | "right_shoulder"
  | "left_elbow"
  | "right_elbow"
  | "left_wrist"
  | "right_wrist"
  | "left_hip"
  | "right_hip"
  | "left_knee"
  | "right_knee"
  | "left_ankle"
  | "right_ankle"
  | "left_heel"
  | "right_heel"
  | "left_foot_index"
  | "right_foot_index";

export interface Landmark2D {
  x: number; // normalized [0,1] image-space
  y: number;
  confidence: number; // [0,1]
}

export interface Landmark3D extends Landmark2D {
  z: number; // provider-relative depth; only present if has3D
}

export type Landmark = Landmark2D | Landmark3D;

export interface CommonSkeletonFrame {
  frameIndex: number;
  timestampMs: number;
  joints: Partial<Record<CommonJointId, Landmark>>;
  has3D: boolean;
}

export interface PoseProviderCapabilities {
  keypointCount: number;
  has3D: boolean;
  runtime: "browser" | "server" | "both";
}

/**
 * A PoseProvider extracts a raw pose from a single video frame and reports
 * its own capabilities. It never leaks its native landmark indexing beyond
 * its own module — callers only ever see CommonSkeletonFrame.
 */
export interface PoseProvider {
  readonly name: string;
  readonly version: string;
  readonly capabilities: PoseProviderCapabilities;

  /** Must be called once before extract() is used (loads model/wasm). */
  initialize(): Promise<void>;

  /** Extracts a pose from one frame, already projected into CommonSkeletonFrame. */
  extract(
    frame: HTMLVideoElement | HTMLCanvasElement,
    frameIndex: number,
    timestampMs: number
  ): Promise<CommonSkeletonFrame | null>;

  dispose(): void;
}
