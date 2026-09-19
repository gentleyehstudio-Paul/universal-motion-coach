import type { CommonJointId } from "../pose/types";
import type { MotionSequence } from "./types";
import { fillGaps } from "./array-utils";

/** Resolves a MotionTemplate PhaseDefinition's `primarySignal` string
 * (e.g. "landmark.left_hip.y", "segment_angle.torso", "joint_angle.
 * left_knee_flexion") into a per-frame number[] aligned to the sequence's
 * frames. Gaps (a joint briefly not detected) are forward/back-filled —
 * see docs/architecture.md §3.3, generalizing the same project-a-signal
 * step opencap-processing's gait detector uses. Returns null if the
 * signal was never present in a single frame of this sequence (e.g. a
 * template asks for a joint the camera framing never captured) so
 * callers can fail that phase gracefully instead of detecting garbage. */
export function resolveSignal(sequence: MotionSequence, path: string): number[] | null {
  const [namespace, ...rest] = path.split(".");

  let raw: (number | null)[];
  if (namespace === "landmark") {
    const [jointIdRaw, axisRaw] = rest;
    const jointId = jointIdRaw as CommonJointId;
    const axis = axisRaw as "x" | "y";
    raw = sequence.landmarks.map((frame) => frame.joints[jointId]?.[axis] ?? null);
  } else if (namespace === "segment_angle") {
    const key = rest.join(".");
    raw = sequence.segmentAngles.map((frame) => frame.angles[key] ?? null);
  } else if (namespace === "joint_angle") {
    const key = rest.join(".");
    raw = sequence.jointAngles.map((frame) => frame.angles[key] ?? null);
  } else {
    throw new Error(`Unknown primarySignal namespace: "${namespace}" in "${path}"`);
  }

  if (raw.every((v) => v === null)) return null;
  return fillGaps(raw);
}
