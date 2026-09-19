// docs/data-model.md §3 — sport configuration is data, not code. Loading
// a new sport means adding a template.json here, never touching this file
// or any PhaseDetector/rule-engine code.
import type { CommonJointId } from "../pose/types";

export type SignalCondition =
  | { type: "local_max" | "local_min" }
  | { type: "threshold_crossed"; direction: "above" | "below"; value: number }
  | { type: "velocity_sign_change" };

export interface PhaseDefinition {
  name: string;
  primarySignal: string;
  entryCondition: SignalCondition;
  exitCondition: SignalCondition;
}

export interface MotionTemplate {
  sportId: string;
  displayName: string;
  cameraGuidance: {
    angle: string;
    distance: string;
    orientation: "side" | "front" | "front_side" | "45_degree";
  };
  phases: PhaseDefinition[];
  keyJoints: CommonJointId[];
  relevantAngles: string[];
  temporalRelationships: {
    before: string;
    after: string;
    maxGapMs?: number;
    minGapMs?: number;
  }[];
  evaluationRuleIds: string[];
  visualization?: {
    anchor?: "hip" | "torso" | "foot" | string;
    rotationNormalization?: boolean;
    trailJoints?: CommonJointId[];
  };
}
