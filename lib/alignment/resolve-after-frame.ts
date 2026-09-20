import type { AlignmentMap } from "./types";

/** Looks up the after-frame aligned to a given before-frame. A
 * before-frame outside any matched phase (see alignment.py — a phase
 * missing from either sequence is skipped) has no entry in frameMap;
 * rather than showing nothing, this falls back to whichever mapped
 * before-frame is closest, so the ghost overlay degrades gracefully
 * instead of blanking out for stretches with no alignment data. */
export function resolveAfterFrame(alignment: AlignmentMap, beforeFrame: number): number | null {
  const direct = alignment.frameMap[beforeFrame];
  if (direct !== undefined) return direct;

  const keys = Object.keys(alignment.frameMap).map(Number);
  if (keys.length === 0) return null;

  let closestKey = keys[0]!;
  let closestDistance = Math.abs(closestKey - beforeFrame);
  for (const key of keys) {
    const distance = Math.abs(key - beforeFrame);
    if (distance < closestDistance) {
      closestKey = key;
      closestDistance = distance;
    }
  }
  return alignment.frameMap[closestKey]!;
}
