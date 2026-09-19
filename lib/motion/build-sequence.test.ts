import { describe, expect, it } from "vitest";
import { buildMotionSequence } from "./build-sequence";
import {
  buildSyntheticSquatFrames,
  SYNTHETIC_SQUAT_VIDEO_WIDTH,
  SYNTHETIC_SQUAT_VIDEO_HEIGHT,
} from "./__fixtures__/synthetic-squat";

describe("buildMotionSequence", () => {
  const frames = buildSyntheticSquatFrames(60);
  const sequence = buildMotionSequence({
    id: "test-sequence",
    sourceVideoRef: null,
    poseProvider: { name: "synthetic", version: "0", has3D: false },
    videoWidth: SYNTHETIC_SQUAT_VIDEO_WIDTH,
    videoHeight: SYNTHETIC_SQUAT_VIDEO_HEIGHT,
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

  it("leaves phases empty (phase detection is a separate pipeline step)", () => {
    expect(sequence.phases).toEqual([]);
  });
});
