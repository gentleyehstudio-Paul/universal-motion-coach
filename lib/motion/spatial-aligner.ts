import type { CommonJointId } from "../pose/types";
import { ALL_COMMON_JOINT_IDS } from "../pose/all-joint-ids";
import type { MotionSequence, Point2D } from "./types";
import { toPixelSpace, sub, rotateVector } from "./geometry";

export type AnchorKind = "hip" | "torso" | "foot" | CommonJointId;

export interface SpatialAlignmentResult {
  anchor: AnchorKind;
  /** The body-length scale (sequence.normalization.scaleValuePx) each
   * position was divided by — same reference M2 uses for velocity, so a
   * "1.0" unit here means "one shoulder-hip distance," comparable across
   * two recordings shot at different distances/resolutions. */
  scale: number;
  rotationApplied: boolean;
  /** One entry per original frame. Positions are anchor-relative and
   * scaled to body-length units — NOT normalized [0,1] image-space
   * anymore, unlike everywhere else in MotionSequence. A joint missing
   * from the source frame is simply absent here too. */
  frames: Partial<Record<CommonJointId, Point2D>>[];
}

/**
 * Translates every joint to be relative to a chosen anchor, scales to
 * body-length units, and — only when the template says the movement's
 * facing/orientation isn't itself meaningful (docs/architecture.md §3.7,
 * e.g. squat's `visualization.rotationNormalization: true`) — rotates so
 * the torso appears vertical every frame. This is what the M6 ghost
 * overlay will render two of (before + after) in the same coordinate
 * space; it does not render anything itself.
 */
export function normalizeSpatially(
  sequence: MotionSequence,
  anchor: AnchorKind,
  applyRotation: boolean
): SpatialAlignmentResult {
  const scale = sequence.normalization.scaleValuePx || 1;

  const frames = sequence.landmarks.map((frame, i) => {
    const anchorPoint = resolveAnchorPoint(sequence, anchor, i);
    if (!anchorPoint) return {};
    const anchorPx = toPixelSpace(anchorPoint, sequence.videoWidth, sequence.videoHeight);

    // See geometry.ts's rotateVector doc comment: rotating by
    // +torsoAngle (not -torsoAngle) is what zeroes out the lean, given
    // segmentAngleFromVertical's atan2(dx, dy) convention — verified in
    // spatial-aligner.test.ts against a fixture with a known lean.
    const rotationDegrees = applyRotation ? sequence.torsoAngle[i]! : 0;

    const result: Partial<Record<CommonJointId, Point2D>> = {};
    for (const jointId of ALL_COMMON_JOINT_IDS) {
      const lm = frame.joints[jointId];
      if (!lm) continue;
      const px = toPixelSpace(lm, sequence.videoWidth, sequence.videoHeight);
      let relative = sub(px, anchorPx);
      if (applyRotation) relative = rotateVector(relative, rotationDegrees);
      result[jointId] = { x: relative.x / scale, y: relative.y / scale };
    }
    return result;
  });

  return { anchor, scale, rotationApplied: applyRotation, frames };
}

function resolveAnchorPoint(
  sequence: MotionSequence,
  anchor: AnchorKind,
  frameIndex: number
): Point2D | null {
  if (anchor === "hip") return sequence.hipCenter[frameIndex] ?? null;
  if (anchor === "torso") return sequence.bodyCenter[frameIndex] ?? null;
  if (anchor === "foot") {
    const frame = sequence.landmarks[frameIndex];
    const l = frame?.joints.left_ankle;
    const r = frame?.joints.right_ankle;
    if (l && r) return { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
    return l ? { x: l.x, y: l.y } : r ? { x: r.x, y: r.y } : null;
  }
  const frame = sequence.landmarks[frameIndex];
  const lm = frame?.joints[anchor];
  return lm ? { x: lm.x, y: lm.y } : null;
}
