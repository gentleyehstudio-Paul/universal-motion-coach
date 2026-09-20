// M7 cross-sport validation (docs/mvp-plan.md): a 4th, unplanned
// movement added via config only (sports/pushup/{template,rules}.json +
// two lines in lib/template/registry.ts) — no changes to build-sequence,
// phase-detector, evaluate, or any other core pipeline file. This test
// suite exists to prove that claim with the same rigor as the squat
// fixture's tests, not just assert it in a commit message.
import { describe, expect, it } from "vitest";
import { buildMotionSequence } from "./build-sequence";
import { detectPhases } from "./phase-detector";
import { evaluateRules } from "../rules/evaluate";
import { selectPrimaryFinding } from "../rules/select-primary";
import { generateCorrection } from "../correction/generate";
import {
  buildSyntheticPushupFrames,
  SYNTHETIC_PUSHUP_VIDEO_WIDTH,
  SYNTHETIC_PUSHUP_VIDEO_HEIGHT,
  SYNTHETIC_PUSHUP_PHASE_BOUNDARIES,
} from "./__fixtures__/synthetic-pushup";
import type { MotionTemplate } from "../template/types";
import type { SportRuleSet } from "../rules/types";
import pushupTemplateJson from "../../sports/pushup/template.json";
import pushupRulesJson from "../../sports/pushup/rules.json";

const pushupTemplate = pushupTemplateJson as MotionTemplate;
const pushupRules = pushupRulesJson as SportRuleSet;

function analyze(bottomElbowAngleDeg: number, sagAmount: number) {
  const frames = buildSyntheticPushupFrames(60, bottomElbowAngleDeg, sagAmount);
  const sequence = buildMotionSequence({
    id: "test-sequence",
    sourceVideoRef: null,
    poseProvider: { name: "synthetic", version: "0", has3D: false },
    videoWidth: SYNTHETIC_PUSHUP_VIDEO_WIDTH,
    videoHeight: SYNTHETIC_PUSHUP_VIDEO_HEIGHT,
    frames,
  });
  const withPhases = { ...sequence, phases: detectPhases(sequence, pushupTemplate) };
  const findings = evaluateRules(withPhases, pushupRules.evaluationRules);
  return { sequence: withPhases, findings };
}

describe("push-up: motion representation reuses existing joint-angle defs unchanged", () => {
  it("computes ~180° elbow extension at the top", () => {
    const { sequence } = analyze(90, 0);
    const topFrame = sequence.jointAngles[2]!;
    expect(topFrame.angles.left_elbow_flexion).toBeGreaterThan(170);
  });

  it("computes ~90° elbow flexion at the bottom", () => {
    const { sequence } = analyze(90, 0);
    const bottomFrame = sequence.jointAngles[30]!;
    expect(bottomFrame.angles.left_elbow_flexion).toBeGreaterThan(78);
    expect(bottomFrame.angles.left_elbow_flexion).toBeLessThan(102);
  });

  it("computes ~180° hip_flexion (straight body) with zero sag", () => {
    const { sequence } = analyze(90, 0);
    const bottomFrame = sequence.jointAngles[30]!;
    expect(bottomFrame.angles.left_hip_flexion).toBeGreaterThan(175);
  });
});

describe("push-up: the same generic PhaseDetector, driven only by template.json", () => {
  it("detects the 5 configured phases in order, using landmark.left_shoulder.y", () => {
    const { sequence } = analyze(90, 0);
    expect(sequence.phases.map((p) => p.name)).toEqual([
      "top",
      "descent",
      "bottom",
      "ascent",
      "top_end",
    ]);
  });

  it("places phase boundaries near the fixture's known ground truth", () => {
    const { sequence } = analyze(90, 0);
    const descent = sequence.phases.find((p) => p.name === "descent")!;
    const TOLERANCE = 5;
    expect(descent.endFrame).toBeGreaterThanOrEqual(
      SYNTHETIC_PUSHUP_PHASE_BOUNDARIES.descentEnd - TOLERANCE
    );
    expect(descent.endFrame).toBeLessThanOrEqual(
      SYNTHETIC_PUSHUP_PHASE_BOUNDARIES.descentEnd + TOLERANCE
    );
  });
});

describe("push-up: the same generic rule engine, driven only by rules.json", () => {
  it("flags neither rule for a full-depth, straight-body rep", () => {
    const { findings } = analyze(90, 0);
    expect(findings).toHaveLength(0);
  });

  it("flags insufficient_depth for a shallow rep (~150° at bottom)", () => {
    const { findings } = analyze(150, 0);
    const finding = findings.find((f) => f.issueId === "pushup.insufficient_depth");
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("severe");
    expect(finding!.qualityDimension).toBe("completeness");
  });

  it("flags hip_sag for a sagging rep, independent of elbow depth", () => {
    const { findings } = analyze(90, 60);
    const finding = findings.find((f) => f.issueId === "pushup.hip_sag");
    expect(finding).toBeDefined();
    expect(finding!.measuredValue).toBeLessThan(160);
    expect(finding!.qualityDimension).toBe("alignment");
  });

  it("selects a primary finding and generates a complete Correction when both fire", () => {
    const { findings } = analyze(150, 60);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    const primary = selectPrimaryFinding(findings)!;
    const template = pushupRules.corrections[primary.issueId]!;
    const correction = generateCorrection(primary, template);
    expect(correction.cue).toBe(template.cue);
    expect(correction.drill).toBe(template.drill);
  });
});
