import { buildMotionSequence } from "../motion/build-sequence";
import { detectPhases } from "../motion/phase-detector";
import { evaluateRules } from "../rules/evaluate";
import { selectPrimaryFinding } from "../rules/select-primary";
import { generateCorrection } from "../correction/generate";
import type { MotionTemplate } from "../template/types";
import type { SportRuleSet } from "../rules/types";
import type { Correction, Finding, MotionSequence } from "../motion/types";
import type { CommonSkeletonFrame } from "../pose/types";

export interface AnalyzedAttempt {
  sequence: MotionSequence;
  primary: { finding: Finding; correction: Correction } | null;
}

/** Runs the full M1-M4 pipeline (motion representation -> phase
 * detection -> rule evaluation -> correction) on one recorded attempt.
 * Used identically for both the "before" and "after" recordings
 * (docs/mvp-plan.md M5) so there is exactly one place this wiring lives. */
export function analyzeAttempt(
  frames: CommonSkeletonFrame[],
  videoWidth: number,
  videoHeight: number,
  template: MotionTemplate,
  ruleSet: SportRuleSet
): AnalyzedAttempt {
  const built = buildMotionSequence({
    id: crypto.randomUUID(),
    sourceVideoRef: null,
    poseProvider: { name: "mediapipe-pose-landmarker", version: "0.10.14", has3D: true },
    videoWidth,
    videoHeight,
    frames,
  });
  const sequence: MotionSequence = { ...built, phases: detectPhases(built, template) };

  const findings = evaluateRules(sequence, ruleSet.evaluationRules);
  const primaryFinding = selectPrimaryFinding(findings);

  let primary: AnalyzedAttempt["primary"] = null;
  if (primaryFinding) {
    const correctionTemplate = ruleSet.corrections[primaryFinding.issueId];
    if (correctionTemplate) {
      primary = {
        finding: primaryFinding,
        correction: generateCorrection(primaryFinding, correctionTemplate),
      };
    }
  }

  return { sequence, primary };
}
