import { describe, expect, it } from "vitest";
import { buildMotionSequence } from "./build-sequence";
import type { CommonSkeletonFrame } from "../pose/types";

const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;
const FPS = 30;

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
  // Direction from ankle to knee: mostly "up" (negative y), tilted forward by shankTiltDeg.
  const ankleToKnee = rotateDegrees({ x: 0, y: -1 }, shankTiltDeg);
  const knee = {
    x: ankle.x + ankleToKnee.x * shankLength,
    y: ankle.y + ankleToKnee.y * shankLength,
  };

  const kneeToAnkle = { x: ankle.x - knee.x, y: ankle.y - knee.y };
  const kneeAngleDeg = 180 - 90 * d; // 180 standing, 90 at bottom
  const deltaFromStraight = 180 - kneeAngleDeg;
  // thigh direction = (knee->ankle reversed), rotated by deltaFromStraight;
  // this makes the angle at the knee between (knee->hip) and (knee->ankle)
  // equal to kneeAngleDeg exactly, by construction.
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
  return { x: p.x / VIDEO_WIDTH, y: p.y / VIDEO_HEIGHT, confidence: 0.95 };
}

/** depth(t): 0 -> 0 -> 1 -> 1 -> 0 -> 0 across standing/descent/bottom/
 * ascent/standing, using smoothstep ramps so the trajectory has no sharp
 * kinks (matching how a real squat, and the Butterworth filter's
 * assumptions about smooth underlying motion, actually behave). */
function depthAtFrame(i: number, totalFrames: number) {
  const standing1End = 10;
  const descentEnd = 25;
  const bottomEnd = 35;
  const ascentEnd = 50;
  if (i < standing1End) return 0;
  if (i < descentEnd) return smoothstep((i - standing1End) / (descentEnd - standing1End));
  if (i < bottomEnd) return 1;
  if (i < ascentEnd) return 1 - smoothstep((i - bottomEnd) / (ascentEnd - bottomEnd));
  return 0;
}

function buildSyntheticSquatFrames(totalFrames: number): CommonSkeletonFrame[] {
  const frames: CommonSkeletonFrame[] = [];
  for (let i = 0; i < totalFrames; i++) {
    const d = depthAtFrame(i, totalFrames);
    const left = squatFrameAtDepth(d, -20);
    const right = squatFrameAtDepth(d, 20);
    frames.push({
      frameIndex: i,
      timestampMs: (i * 1000) / FPS,
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

describe("buildMotionSequence", () => {
  const frames = buildSyntheticSquatFrames(60);
  const sequence = buildMotionSequence({
    id: "test-sequence",
    sourceVideoRef: null,
    poseProvider: { name: "synthetic", version: "0", has3D: false },
    videoWidth: VIDEO_WIDTH,
    videoHeight: VIDEO_HEIGHT,
    frames,
  });

  it("produces a schema-shaped MotionSequence with one entry per frame", () => {
    expect(sequence.frameCount).toBe(60);
    expect(sequence.landmarks).toHaveLength(60);
    expect(sequence.jointAngles).toHaveLength(60);
    expect(sequence.segmentAngles).toHaveLength(60);
    expect(sequence.velocities).toHaveLength(60);
    expect(sequence.bodyCenter).toHaveLength(60);
    expect(sequence.hipCenter).toHaveLength(60);
    expect(sequence.shoulderCenter).toHaveLength(60);
    expect(sequence.torsoAngle).toHaveLength(60);
    expect(sequence.confidence).toHaveLength(60);
  });

  it("computes ~180° knee flexion while standing", () => {
    const standingFrame = sequence.jointAngles[2]!;
    expect(standingFrame.angles.left_knee_flexion).toBeGreaterThan(170);
    expect(standingFrame.angles.right_knee_flexion).toBeGreaterThan(170);
  });

  it("computes ~90° knee flexion at the bottom of the squat", () => {
    const bottomFrame = sequence.jointAngles[30]!;
    expect(bottomFrame.angles.left_knee_flexion).toBeGreaterThan(78);
    expect(bottomFrame.angles.left_knee_flexion).toBeLessThan(102);
    expect(bottomFrame.angles.right_knee_flexion).toBeGreaterThan(78);
    expect(bottomFrame.angles.right_knee_flexion).toBeLessThan(102);
  });

  it("knee angle decreases monotonically-ish through the descent", () => {
    const anglesAtStart = sequence.jointAngles[10]!.angles.left_knee_flexion!;
    const anglesAtEnd = sequence.jointAngles[24]!.angles.left_knee_flexion!;
    expect(anglesAtEnd).toBeLessThan(anglesAtStart);
  });

  it("returns knee angle back to ~180° after standing back up", () => {
    const finalFrame = sequence.jointAngles[59]!;
    expect(finalFrame.angles.left_knee_flexion).toBeGreaterThan(165);
  });

  it("computes a torso segment angle close to vertical throughout", () => {
    // Our synthetic torso only leans a few degrees forward, so this should
    // stay small and well-formed (not NaN, not wildly large) at every frame.
    for (const angle of sequence.torsoAngle) {
      expect(Number.isFinite(angle)).toBe(true);
      expect(Math.abs(angle)).toBeLessThan(20);
    }
  });

  it("computes non-null velocities once the knee is actually moving", () => {
    const descendingFrame = sequence.velocities[18]!;
    expect(descendingFrame.velocities.left_knee).toBeDefined();
    expect(Number.isFinite(descendingFrame.velocities.left_knee!.speed)).toBe(true);
  });

  it("computes accelerations for a 30fps, 60-frame sequence", () => {
    expect(sequence.accelerations).not.toBeNull();
    expect(sequence.accelerations).toHaveLength(60);
  });

  it("derives a plausible normalization scale from shoulder-hip distance", () => {
    // shoulder-hip pixel distance in our synthetic rig is ~140px on a
    // 640-wide frame; scaleValuePx should be in that ballpark, not 0/NaN/1e9.
    expect(sequence.normalization.scaleValuePx).toBeGreaterThan(50);
    expect(sequence.normalization.scaleValuePx).toBeLessThan(300);
  });

  it("leaves phases empty (M3 PhaseDetector not implemented yet)", () => {
    expect(sequence.phases).toEqual([]);
  });
});
