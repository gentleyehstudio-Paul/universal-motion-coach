import type { CommonSkeletonFrame } from "../../pose/types";

export const SYNTHETIC_SQUAT_VIDEO_WIDTH = 640;
export const SYNTHETIC_SQUAT_VIDEO_HEIGHT = 480;
export const SYNTHETIC_SQUAT_FPS = 30;

// Phase frame boundaries baked into depthAtFrame() below — shared with
// tests that assert detected phase boundaries against these ground-truth
// values.
export const SYNTHETIC_SQUAT_PHASE_BOUNDARIES = {
  standingEnd: 10,
  descentEnd: 25,
  bottomEnd: 35,
  ascentEnd: 50,
};

function rotateDegrees(v: { x: number; y: number }, degrees: number) {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

function smoothstep(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 3 * clamped * clamped - 2 * clamped * clamped * clamped;
}

/** Builds one synthetic frame of a symmetric, side-viewed squat at squat
 * depth `d` (0 = standing, 1 = bottom), constructed via 2D forward
 * kinematics in pixel space so the exact knee angle at each depth is
 * known analytically and can be asserted against, rather than eyeballed
 * from a real (unpredictable) video. Ankle is planted; hip position
 * falls out of the kinematics as the knee bends, matching how a real
 * squat actually moves. */
function squatFrameAtDepth(d: number, sideOffsetX: number) {
  const ankle = { x: 320 + sideOffsetX, y: 420 };
  const shankLength = 120;
  const thighLength = 120;
  const shoulderOffset = 140;

  const shankTiltDeg = 5 + 10 * d; // slight forward shin tilt as squat deepens
  const ankleToKnee = rotateDegrees({ x: 0, y: -1 }, shankTiltDeg);
  const knee = {
    x: ankle.x + ankleToKnee.x * shankLength,
    y: ankle.y + ankleToKnee.y * shankLength,
  };

  const kneeToAnkle = { x: ankle.x - knee.x, y: ankle.y - knee.y };
  const kneeAngleDeg = 180 - 90 * d; // 180 standing, 90 at bottom
  const deltaFromStraight = 180 - kneeAngleDeg;
  const kneeToHipDir = rotateDegrees(
    { x: -kneeToAnkle.x, y: -kneeToAnkle.y },
    deltaFromStraight
  );
  const norm = Math.hypot(kneeToHipDir.x, kneeToHipDir.y);
  const hip = {
    x: knee.x + (kneeToHipDir.x / norm) * thighLength,
    y: knee.y + (kneeToHipDir.y / norm) * thighLength,
  };

  const shoulder = { x: hip.x + 15 * d, y: hip.y - shoulderOffset };

  return { ankle, knee, hip, shoulder, kneeAngleDeg };
}

function toLandmark(p: { x: number; y: number }) {
  return {
    x: p.x / SYNTHETIC_SQUAT_VIDEO_WIDTH,
    y: p.y / SYNTHETIC_SQUAT_VIDEO_HEIGHT,
    confidence: 0.95,
  };
}

/** depth(t): 0 -> 0 -> 1 -> 1 -> 0 -> 0 across standing/descent/bottom/
 * ascent/standing, using smoothstep ramps so the trajectory has no sharp
 * kinks (matching how a real squat, and the Butterworth filter's
 * assumptions about smooth underlying motion, actually behave). */
function depthAtFrame(i: number): number {
  const { standingEnd, descentEnd, bottomEnd, ascentEnd } = SYNTHETIC_SQUAT_PHASE_BOUNDARIES;
  if (i < standingEnd) return 0;
  if (i < descentEnd) return smoothstep((i - standingEnd) / (descentEnd - standingEnd));
  if (i < bottomEnd) return 1;
  if (i < ascentEnd) return 1 - smoothstep((i - bottomEnd) / (ascentEnd - bottomEnd));
  return 0;
}

export function buildSyntheticSquatFrames(totalFrames: number): CommonSkeletonFrame[] {
  const frames: CommonSkeletonFrame[] = [];
  for (let i = 0; i < totalFrames; i++) {
    const d = depthAtFrame(i);
    const left = squatFrameAtDepth(d, -20);
    const right = squatFrameAtDepth(d, 20);
    frames.push({
      frameIndex: i,
      timestampMs: (i * 1000) / SYNTHETIC_SQUAT_FPS,
      has3D: false,
      joints: {
        left_ankle: toLandmark(left.ankle),
        left_knee: toLandmark(left.knee),
        left_hip: toLandmark(left.hip),
        left_shoulder: toLandmark(left.shoulder),
        right_ankle: toLandmark(right.ankle),
        right_knee: toLandmark(right.knee),
        right_hip: toLandmark(right.hip),
        right_shoulder: toLandmark(right.shoulder),
      },
    });
  }
  return frames;
}
