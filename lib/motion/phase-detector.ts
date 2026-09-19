import type { MotionTemplate, SignalCondition } from "../template/types";
import type { DetectedPhase, MotionSequence } from "./types";
import { resolveSignal } from "./signal-resolver";

/** Generic, sport-agnostic phase detector: project the MotionSequence
 * onto each phase's named signal, find the next matching event, and
 * carry the search position forward — see docs/architecture.md §3.3.
 *
 * Ordering/validation is structural rather than a separate pass: because
 * each phase's boundary is only ever searched for *after* the previous
 * phase's boundary, an out-of-order or duplicate candidate earlier in the
 * clip can never be selected. This achieves the same effect as detecting
 * candidates first and then validating their order against
 * temporalRelationships (opencap-processing's detect_correct_order()
 * pattern), just built in validated order from the start rather than
 * filtered after the fact.
 */
export function detectPhases(
  sequence: MotionSequence,
  template: MotionTemplate
): DetectedPhase[] {
  const results: DetectedPhase[] = [];
  const lastFrameIndex = sequence.frameCount - 1;
  let searchStart = 0;

  for (const phase of template.phases) {
    if (searchStart > lastFrameIndex) break; // ran out of clip; remaining phases undetected

    const startFrame = searchStart;
    let endFrame: number;
    let confidence: number;

    if (phase.exitCondition.type === "sequence_boundary") {
      endFrame = lastFrameIndex;
      confidence = 1;
    } else {
      const signal = resolveSignal(sequence, phase.primarySignal);
      if (signal === null) {
        // Template asked for a signal this recording never captured
        // (e.g. camera framing cut off a needed joint) — skip the phase
        // rather than guess.
        continue;
      }
      const candidate = findNextEvent(signal, phase.exitCondition, startFrame);
      if (candidate === null) {
        endFrame = lastFrameIndex;
        confidence = 0.3; // condition never matched before the clip ended
      } else {
        endFrame = candidate;
        confidence = 1;
      }
    }

    results.push({ name: phase.name, startFrame, endFrame, confidence });
    searchStart = endFrame;
  }

  return results;
}

function findNextEvent(
  signal: number[],
  condition: Exclude<SignalCondition, { type: "sequence_boundary" }>,
  fromIndex: number
): number | null {
  const vel = velocitySeries(signal);
  const epsilon = noiseFloor(vel);
  switch (condition.type) {
    case "threshold_crossed":
      return findThresholdCrossing(signal, condition.direction, condition.value, fromIndex);
    // "Rising stops" / "falling stops": every local_max/local_min in these
    // templates marks the end of a directed movement into a brief static
    // hold (bottom of a squat, top of a backswing, load before a jump),
    // not necessarily an instantaneous reversal — a plateau has no frame
    // where velocity flips sign, so detecting "the run of significant
    // same-signed velocity just ended" is what actually generalizes here.
    case "local_max":
      return findMotionStops(vel, epsilon, fromIndex, 1);
    case "local_min":
      return findMotionStops(vel, epsilon, fromIndex, -1);
    // The mirror image: leaving a static hold and starting to move again,
    // in whichever direction — not specifically "sign A directly follows
    // sign B," since real holds have zero velocity in between, not an
    // instant flip.
    case "velocity_sign_change":
      return findMotionResumes(vel, epsilon, fromIndex);
  }
}

function findThresholdCrossing(
  signal: number[],
  direction: "above" | "below",
  value: number,
  fromIndex: number
): number | null {
  for (let i = Math.max(fromIndex, 1); i < signal.length; i++) {
    const prev = signal[i - 1]!;
    const curr = signal[i]!;
    const crossedAbove = prev < value && curr >= value;
    const crossedBelow = prev > value && curr <= value;
    if ((direction === "above" && crossedAbove) || (direction === "below" && crossedBelow)) {
      return i;
    }
  }
  return null;
}

/** velocity[i] = signal[i] - signal[i-1], for i in [1, signal.length).
 * Frame-index-spaced (not time-spaced) since phases are expressed in
 * frame indices, not seconds. */
function velocitySeries(signal: number[]): number[] {
  const vel = new Array<number>(signal.length).fill(0);
  for (let i = 1; i < signal.length; i++) {
    vel[i] = signal[i]! - signal[i - 1]!;
  }
  if (signal.length > 1) vel[0] = vel[1]!;
  return vel;
}

/** A fraction of the signal's own peak velocity, below which a sample is
 * treated as noise rather than genuine direction — without this, a
 * near-flat plateau (e.g. holding a static position) produces spurious
 * sign flips from sub-pixel filter/detector jitter. */
function noiseFloor(vel: number[]): number {
  const maxAbs = vel.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  return maxAbs * 0.05;
}

/** First frame at/after fromIndex where a run of `sign`-directed,
 * above-noise-floor velocity ends (drops to <= epsilon or reverses).
 * Used for local_max (sign=1: a rise topping out) and local_min
 * (sign=-1: a fall bottoming out). */
function findMotionStops(
  vel: number[],
  epsilon: number,
  fromIndex: number,
  sign: 1 | -1
): number | null {
  let inRun = false;
  for (let i = Math.max(fromIndex, 1); i < vel.length; i++) {
    const v = vel[i]!;
    const significant = sign === 1 ? v > epsilon : v < -epsilon;
    if (significant) {
      inRun = true;
      continue;
    }
    if (inRun) return i;
  }
  return null;
}

/** First frame at/after fromIndex where velocity magnitude exceeds the
 * noise floor, in either direction — leaving a static hold. */
function findMotionResumes(vel: number[], epsilon: number, fromIndex: number): number | null {
  for (let i = Math.max(fromIndex, 1); i < vel.length; i++) {
    if (Math.abs(vel[i]!) > epsilon) return i;
  }
  return null;
}
