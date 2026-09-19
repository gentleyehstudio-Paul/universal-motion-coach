import type { QualityDimension, Finding } from "../motion/types";

/** How to reduce a resolved signal (see signal-resolver.ts) over a
 * phase's frame span into the single number an EvaluationRule compares
 * against its baseline. max_abs/min_abs return a magnitude (always >=0)
 * so a signed signal like torso lean can be thresholded regardless of
 * which direction it leaned. */
export interface MetricSpec {
  signal: string;
  aggregation: "min" | "max" | "mean" | "at_start" | "at_end" | "max_abs" | "min_abs";
}

export type Comparison = "greater_than" | "less_than";

/** Sport configuration (data, not code) — see docs/architecture.md §3.4.
 * "greater_than": flag when measured exceeds baselineValue (e.g. too
 * much forward lean). "less_than": flag when measured falls short of
 * baselineValue (e.g. not enough squat depth, not enough shoulder turn).
 * severityBands are magnitudes of deviation from baseline, in the rule's
 * own unit — the smallest one a real deviation must clear before a
 * Finding is generated at all (a 1-degree deviation isn't worth
 * reporting). */
export interface EvaluationRule {
  id: string;
  issueId: string;
  qualityDimension: QualityDimension;
  phase: string;
  metric: MetricSpec;
  baselineSource: Finding["baselineSource"];
  baselineValue: number;
  comparison: Comparison;
  unit: Finding["unit"];
  severityBands: { mild: number; moderate: number; severe: number };
}

/** The authored cue/drill/explanation library, keyed by issueId — see
 * docs/architecture.md §3.5. This is what the correction engine narrows
 * into a Correction; an LLM may later polish `why`'s phrasing (see
 * lib/correction/generate.ts), but the template text alone is already
 * complete, usable coaching guidance without one. */
export interface CorrectionTemplate {
  what: string;
  why: string;
  whatToChange: string;
  cue: string;
  drill: string;
}

export interface SportRuleSet {
  evaluationRules: EvaluationRule[];
  corrections: Record<string, CorrectionTemplate>;
}
