import { describe, expect, it } from "vitest";
import { buildMotionSequence } from "../motion/build-sequence";
import { detectPhases } from "../motion/phase-detector";
import { evaluateRules } from "./evaluate";
import { selectPrimaryFinding } from "./select-primary";
import { generateCorrection } from "../correction/generate";
import {
  buildSyntheticSquatFrames,
  SYNTHETIC_SQUAT_VIDEO_WIDTH,
  SYNTHETIC_SQUAT_VIDEO_HEIGHT,
} from "../motion/__fixtures__/synthetic-squat";
import type { MotionTemplate } from "../template/types";
import type { SportRuleSet } from "./types";
import squatTemplateJson from "../../sports/squat/template.json";
import squatRulesJson from "../../sports/squat/rules.json";

const squatTemplate = squatTemplateJson as MotionTemplate;
const squatRules = squatRulesJson as SportRuleSet;

function analyze(bottomKneeAngleDeg: number) {
  const frames = buildSyntheticSquatFrames(60, bottomKneeAngleDeg);
  const sequence = buildMotionSequence({
    id: "test-sequence",
    sourceVideoRef: null,
    poseProvider: { name: "synthetic", version: "0", has3D: false },
    videoWidth: SYNTHETIC_SQUAT_VIDEO_WIDTH,
    videoHeight: SYNTHETIC_SQUAT_VIDEO_HEIGHT,
    frames,
  });
  const withPhases = { ...sequence, phases: detectPhases(sequence, squatTemplate) };
  const findings = evaluateRules(withPhases, squatRules.evaluationRules);
  return { sequence: withPhases, findings };
}

describe("evaluateRules (squat)", () => {
  it("does not flag insufficient_depth for a full-depth squat (~90° at bottom)", () => {
    const { findings } = analyze(90);
    expect(findings.find((f) => f.issueId === "squat.insufficient_depth")).toBeUndefined();
  });

  it("flags insufficient_depth for a shallow squat that only reaches ~150°", () => {
    const { findings } = analyze(150);
    const finding = findings.find((f) => f.issueId === "squat.insufficient_depth");
    expect(finding).toBeDefined();
    expect(finding!.measuredValue).toBeGreaterThan(140);
    expect(finding!.baselineValue).toBe(100);
    expect(finding!.severity).toBe("severe"); // ~150 vs 100 baseline = 50 deviation, well past the 35 severe band
    expect(finding!.qualityDimension).toBe("completeness");
  });

  it("does not flag excessive_forward_lean for our small-lean synthetic rig", () => {
    const { findings } = analyze(90);
    expect(findings.find((f) => f.issueId === "squat.excessive_forward_lean")).toBeUndefined();
  });

  it("produces findings with confidence in (0, 1]", () => {
    const { findings } = analyze(150);
    for (const finding of findings) {
      expect(finding.confidence).toBeGreaterThan(0);
      expect(finding.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe("selectPrimaryFinding + generateCorrection (squat)", () => {
  it("selects insufficient_depth as primary and generates a complete Correction", () => {
    const { findings } = analyze(150);
    const primary = selectPrimaryFinding(findings);
    expect(primary).not.toBeNull();
    expect(primary!.issueId).toBe("squat.insufficient_depth");

    const template = squatRules.corrections[primary!.issueId]!;
    const correction = generateCorrection(primary!, template);

    expect(correction.what).toBe(template.what);
    expect(correction.cue).toBe(template.cue);
    expect(correction.drill).toBe(template.drill);
    expect(correction.when).toBe("bottom");
    expect(correction.why).toContain("measured");
    expect(correction.why).toContain("target of 100.0");
  });

  it("returns null when no rule fires", () => {
    const { findings } = analyze(90);
    expect(selectPrimaryFinding(findings)).toBeNull();
  });
});
