import type { MotionSequence, Finding } from "../motion/types";
import { resolveSignal } from "../motion/signal-resolver";
import type { EvaluationRule, MetricSpec } from "./types";

/** Evaluates every rule against a MotionSequence's detected phases,
 * producing objective Findings — pure computation, no LLM involved (see
 * docs/architecture.md §3.4's CV/rules/LLM separation). A rule is
 * skipped, not defaulted to "no problem," when its phase wasn't
 * detected or its signal was never captured — we don't fabricate a
 * judgment from missing data. */
export function evaluateRules(sequence: MotionSequence, rules: EvaluationRule[]): Finding[] {
  const findings: Finding[] = [];

  for (const rule of rules) {
    const phase = sequence.phases.find((p) => p.name === rule.phase);
    if (!phase) continue;

    const measuredValue = measureRule(sequence, rule);
    if (measuredValue === null) continue;

    const deviation =
      rule.comparison === "greater_than"
        ? measuredValue - rule.baselineValue
        : rule.baselineValue - measuredValue;
    if (deviation <= 0) continue; // within normal range, no finding

    const severity = classifySeverity(deviation, rule.severityBands);
    if (!severity) continue; // real but negligible deviation, below the "mild" floor

    const frameConfidences = sequence.confidence.slice(phase.startFrame, phase.endFrame + 1);
    const avgFrameConfidence =
      frameConfidences.length > 0
        ? frameConfidences.reduce((a, b) => a + b, 0) / frameConfidences.length
        : 0;

    findings.push({
      issueId: rule.issueId,
      qualityDimension: rule.qualityDimension,
      phase: rule.phase,
      confidence: phase.confidence * avgFrameConfidence,
      measuredValue,
      baselineValue: rule.baselineValue,
      unit: rule.unit,
      severity,
      baselineSource: rule.baselineSource,
    });
  }

  return findings;
}

/** The raw aggregated measurement for a rule, regardless of whether it
 * would clear the "mild" deviation threshold. evaluateRules() only ever
 * reports a Finding once that bar is cleared, but a before/after
 * comparison needs the actual number even when "after" is now within
 * normal range (that's the improvement the comparison exists to show) —
 * see the record page's after-recording comparison. */
export function measureRule(sequence: MotionSequence, rule: EvaluationRule): number | null {
  const phase = sequence.phases.find((p) => p.name === rule.phase);
  if (!phase) return null;

  const signal = resolveSignal(sequence, rule.metric.signal);
  if (signal === null) return null;

  return aggregate(signal, rule.metric.aggregation, phase.startFrame, phase.endFrame);
}

function aggregate(
  signal: number[],
  kind: MetricSpec["aggregation"],
  startFrame: number,
  endFrame: number
): number | null {
  const slice = signal.slice(startFrame, endFrame + 1);
  if (slice.length === 0) return null;
  switch (kind) {
    case "min":
      return Math.min(...slice);
    case "max":
      return Math.max(...slice);
    case "mean":
      return slice.reduce((a, b) => a + b, 0) / slice.length;
    case "at_start":
      return slice[0]!;
    case "at_end":
      return slice[slice.length - 1]!;
    case "max_abs":
      return Math.max(...slice.map((v) => Math.abs(v)));
    case "min_abs":
      return Math.min(...slice.map((v) => Math.abs(v)));
  }
}

function classifySeverity(
  deviation: number,
  bands: { mild: number; moderate: number; severe: number }
): Finding["severity"] | null {
  if (deviation >= bands.severe) return "severe";
  if (deviation >= bands.moderate) return "moderate";
  if (deviation >= bands.mild) return "mild";
  return null;
}
