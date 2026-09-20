import { describe, expect, it } from "vitest";
import { buildMotionSequence } from "./build-sequence";
import { normalizeSpatially } from "./spatial-aligner";
import {
  buildSyntheticSquatFrames,
  SYNTHETIC_SQUAT_VIDEO_WIDTH,
  SYNTHETIC_SQUAT_VIDEO_HEIGHT,
} from "./__fixtures__/synthetic-squat";

describe("normalizeSpatially", () => {
  const frames = buildSyntheticSquatFrames(60);
  const sequence = buildMotionSequence({
    id: "test-sequence",
    sourceVideoRef: null,
    poseProvider: { name: "synthetic", version: "0", has3D: false },
    videoWidth: SYNTHETIC_SQUAT_VIDEO_WIDTH,
    videoHeight: SYNTHETIC_SQUAT_VIDEO_HEIGHT,
    frames,
  });

  it("places the chosen anchor joint at the origin every frame", () => {
    const result = normalizeSpatially(sequence, "left_hip", false);
    for (const frame of result.frames) {
      const hip = frame.left_hip!;
      expect(Math.abs(hip.x)).toBeLessThan(1e-9);
      expect(Math.abs(hip.y)).toBeLessThan(1e-9);
    }
  });

  it("scales shoulder-hip distance to ~1.0 body-length unit", () => {
    const result = normalizeSpatially(sequence, "left_hip", false);
    const mid = result.frames[10]!;
    const dx = mid.left_shoulder!.x - mid.left_hip!.x;
    const dy = mid.left_shoulder!.y - mid.left_hip!.y;
    const dist = Math.hypot(dx, dy);
    expect(dist).toBeGreaterThan(0.7);
    expect(dist).toBeLessThan(1.3);
  });

  it("without rotation, a leaning torso stays off-vertical (x != 0)", () => {
    const result = normalizeSpatially(sequence, "hip", false);
    // Our synthetic rig leans forward slightly as squat depth increases;
    // by the bottom of the squat the shoulder should be visibly offset
    // in x from directly above the hip anchor.
    const bottomFrame = result.frames[30]!;
    const dx = bottomFrame.left_shoulder!.x - bottomFrame.left_hip!.x;
    expect(Math.abs(dx)).toBeGreaterThan(0.01);
  });

  it("with rotation enabled, the torso is straightened to vertical (x ~= 0)", () => {
    const result = normalizeSpatially(sequence, "hip", true);
    expect(result.rotationApplied).toBe(true);
    const bottomFrame = result.frames[30]!;
    const dx = bottomFrame.left_shoulder!.x - bottomFrame.left_hip!.x;
    // torsoAngle is derived from the left+right midpoint centers, while
    // this checks one side's raw joints, so a tiny residual (many orders
    // of magnitude below the ~0.1 unit lean being cancelled) is expected
    // rather than exact floating-point zero.
    expect(Math.abs(dx)).toBeLessThan(1e-3);
    // and it should still point the same general direction (not flipped
    // upside down by the rotation)
    const dy = bottomFrame.left_shoulder!.y - bottomFrame.left_hip!.y;
    expect(dy).toBeLessThan(0);
  });

  it("supports 'foot' as an anchor (midpoint of both ankles)", () => {
    const result = normalizeSpatially(sequence, "foot", false);
    const frame = result.frames[0]!;
    expect(Math.abs(frame.left_ankle!.x + frame.right_ankle!.x)).toBeLessThan(1e-6);
  });
});
