import { describe, expect, it } from "vitest";
import { analyzeAttempt } from "./analyze-attempt";
import {
  buildSyntheticSquatFrames,
  SYNTHETIC_SQUAT_VIDEO_WIDTH,
  SYNTHETIC_SQUAT_VIDEO_HEIGHT,
} from "../motion/__fixtures__/synthetic-squat";
import type { MotionTemplate } from "../template/types";
import type { SportRuleSet } from "../rules/types";
import squatTemplateJson from "../../sports/squat/template.json";
import squatRulesJson from "../../sports/squat/rules.json";

const squatTemplate = squatTemplateJson as MotionTemplate;
const squatRules = squatRulesJson as SportRuleSet;

// A glue-code test: build-sequence, phase-detector, evaluate, and
// generateCorrection are each unit-tested on their own; this only checks
// that wiring them together in analyzeAttempt() doesn't drop or
// misorder anything (the kind of bug unit tests of the pieces alone
// wouldn't catch).
describe("analyzeAttempt", () => {
  it("produces a complete pipeline result for a full-depth squat (no primary finding)", () => {
    const frames = buildSyntheticSquatFrames(60, 90);
    const result = analyzeAttempt(
      frames,
      SYNTHETIC_SQUAT_VIDEO_WIDTH,
      SYNTHETIC_SQUAT_VIDEO_HEIGHT,
      squatTemplate,
      squatRules
    );

    expect(result.sequence.phases.length).toBe(5);
    expect(result.primary).toBeNull();
  });

  it("produces a complete Correction for a shallow squat", () => {
    const frames = buildSyntheticSquatFrames(60, 150);
    const result = analyzeAttempt(
      frames,
      SYNTHETIC_SQUAT_VIDEO_WIDTH,
      SYNTHETIC_SQUAT_VIDEO_HEIGHT,
      squatTemplate,
      squatRules
    );

    expect(result.primary).not.toBeNull();
    expect(result.primary!.finding.issueId).toBe("squat.insufficient_depth");
    expect(result.primary!.correction.cue).toBe(
      squatRules.corrections["squat.insufficient_depth"]!.cue
    );
  });
});
