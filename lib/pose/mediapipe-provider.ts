import {
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import type {
  CommonSkeletonFrame,
  Landmark,
  PoseProvider,
  PoseProviderCapabilities,
} from "./types";
import { MEDIAPIPE_LANDMARK_MAP } from "./mediapipe-landmark-map";

// Self-hosted under public/mediapipe (see scripts/setup-mediapipe-assets.mjs)
// rather than fetched from cdn.jsdelivr.net / storage.googleapis.com at
// runtime — see that script's header comment for why.
const WASM_BASE_URL = "/mediapipe/wasm";
const MODEL_ASSET_URL = "/mediapipe/pose_landmarker_lite.task";

/**
 * Browser-side PoseProvider using MediaPipe Pose Landmarker (BlazePose).
 * Runs entirely on-device (WASM/GPU delegate) — video never leaves the
 * browser for pose extraction. See docs/architecture.md §3.1 and
 * docs/mvp-plan.md's V0 pose-model decision.
 */
export class MediaPipeProvider implements PoseProvider {
  readonly name = "mediapipe-pose-landmarker";
  readonly version = "0.10.14";
  readonly capabilities: PoseProviderCapabilities = {
    keypointCount: 33,
    has3D: true,
    runtime: "browser",
  };

  private landmarker: PoseLandmarker | null = null;

  async initialize(): Promise<void> {
    if (this.landmarker) return;
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
    this.landmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_ASSET_URL,
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  }

  async extract(
    frame: HTMLVideoElement | HTMLCanvasElement,
    frameIndex: number,
    timestampMs: number
  ): Promise<CommonSkeletonFrame | null> {
    if (!this.landmarker) {
      throw new Error("MediaPipeProvider.initialize() must be awaited before extract()");
    }

    const result = this.landmarker.detectForVideo(frame, timestampMs);
    const landmarks = result.landmarks[0];
    const worldLandmarks = result.worldLandmarks[0];
    if (!landmarks) return null;

    const joints: CommonSkeletonFrame["joints"] = {};
    for (const [indexStr, jointId] of Object.entries(MEDIAPIPE_LANDMARK_MAP)) {
      const index = Number(indexStr);
      const lm = landmarks[index];
      if (!lm) continue;
      const world = worldLandmarks?.[index];
      joints[jointId!] = toLandmark(lm, world);
    }

    return {
      frameIndex,
      timestampMs,
      joints,
      has3D: Boolean(worldLandmarks),
    };
  }

  dispose(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}

function toLandmark(
  lm: NormalizedLandmark,
  world: NormalizedLandmark | undefined
): Landmark {
  const confidence = lm.visibility ?? 1;
  if (world) {
    return { x: lm.x, y: lm.y, z: world.z, confidence };
  }
  return { x: lm.x, y: lm.y, confidence };
}
