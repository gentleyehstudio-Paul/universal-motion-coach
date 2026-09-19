import { describe, expect, it } from "vitest";
import { buildMotionSequence } from "./build-sequence";
import { detectPhases } from "./phase-detector";
import {
  buildSyntheticSquatFrames,
  SYNTHETIC_SQUAT_VIDEO_WIDTH,
  SYNTHETIC_SQUAT_VIDEO_HEIGHT,
  SYNTHETIC_SQUAT_PHASE_BOUNDARIES,
} from "./__fixtures__/synthetic-squat";
import type { MotionTemplate } from "../template/types";
import squatTemplateJson from "../../sports/squat/template.json";

const squatTemplate = squatTemplateJson as MotionTemplate;

describe("detectPhases (squat)", () => {
  const frames = buildSyntheticSquatFrames(60);
  const sequence = buildMotionSequence({
    id: "test-sequence",
    sourceVideoRef: null,
    poseProvider: { name: "synthetic", version: "0", has3D: false },
    videoWidth: SYNTHETIC_SQUAT_VIDEO_WIDTH,
    videoHeight: SYNTHETIC_SQUAT_VIDEO_HEIGHT,
    frames,
  });
  const phases = detectPhases(sequence, squatTemplate);

  // Frame-count tolerance: the detector needs a couple of consistent-sign
  // samples after each phase boundary to re-establish a trend (see
  // phase-detector.ts's noiseFloor/lastSign comments), so exact boundaries
  // land a few frames later than the synthetic ground truth, not at it.
  const TOLERANCE = 5;

  it("detects one entry per template phase, in order", () => {
    expect(phases.map((p) => p.name)).toEqual([
      "standing",
      "descent",
      "bottom",
      "ascent",
      "standing_end",
    ]);
  });

  it("starts standing at frame 0 and ends standing_end at the last frame", () => {
    expect(phases[0]!.startFrame).toBe(0);
    expect(phases[phases.length - 1]!.endFrame).toBe(sequence.frameCount - 1);
  });

  it("places descent's end near the synthetic bottom-of-squat frame", () => {
    const descent = phases.find((p) => p.name === "descent")!;
    expect(descent.endFrame).toBeGreaterThanOrEqual(
      SYNTHETIC_SQUAT_PHASE_BOUNDARIES.descentEnd - TOLERANCE
    );
    expect(descent.endFrame).toBeLessThanOrEqual(
      SYNTHETIC_SQUAT_PHASE_BOUNDARIES.descentEnd + TOLERANCE
    );
  });

  it("places ascent's end near the synthetic return-to-standing frame", () => {
    const ascent = phases.find((p) => p.name === "ascent")!;
    expect(ascent.endFrame).toBeGreaterThanOrEqual(
      SYNTHETIC_SQUAT_PHASE_BOUNDARIES.ascentEnd - TOLERANCE
    );
    expect(ascent.endFrame).toBeLessThanOrEqual(
      SYNTHETIC_SQUAT_PHASE_BOUNDARIES.ascentEnd + TOLERANCE
    );
  });

  it("gives every phase full confidence when its boundary was actually found", () => {
    // Only a phase that ran off the end of the clip without matching
    // should ever get the reduced 0.3 fallback confidence; none should
    // here since the synthetic clip completes a full squat cycle.
    for (const phase of phases) {
      expect(phase.confidence).toBe(1);
    }
  });

  it("produces non-overlapping, monotonically advancing phase spans", () => {
    for (let i = 1; i < phases.length; i++) {
      expect(phases[i]!.startFrame).toBe(phases[i - 1]!.endFrame);
      expect(phases[i]!.endFrame).toBeGreaterThanOrEqual(phases[i]!.startFrame);
    }
  });
});
