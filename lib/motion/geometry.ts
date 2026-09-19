// Pure geometry helpers for motion representation. All angle math here
// operates on pixel-space coordinates (aspect-ratio corrected), never on
// raw normalized [0,1] landmark coordinates directly — a video that isn't
// square has different x/y normalization scales, which silently distorts
// any angle computed straight from normalized x,y. See toPixelSpace().

export interface Vec2 {
  x: number;
  y: number;
}

/** Converts a provider's normalized [0,1] landmark into real pixel space
 * using the source video's natural dimensions, so x and y share one scale. */
export function toPixelSpace(
  normalized: { x: number; y: number },
  videoWidth: number,
  videoHeight: number
): Vec2 {
  return { x: normalized.x * videoWidth, y: normalized.y * videoHeight };
}

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

function magnitude(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

/** Angle at vertex `b`, formed by points a-b-c, in degrees [0, 180].
 * 180 = fully extended (straight line), smaller = more flexed. This is
 * the standard joint-flexion-angle convention (e.g. knee ~180° standing,
 * ~90° at the bottom of a squat). */
export function jointAngleDegrees(a: Vec2, b: Vec2, c: Vec2): number {
  const v1 = sub(a, b);
  const v2 = sub(c, b);
  const denom = magnitude(v1) * magnitude(v2);
  if (denom === 0) return NaN;
  const cos = Math.max(-1, Math.min(1, dot(v1, v2) / denom));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Signed angle of the vector from `top` to `bottom` relative to vertical
 * (straight down in image space), in degrees. 0 = upright; positive/
 * negative indicates lean direction. Used for torso angle: top =
 * shoulderCenter, bottom = hipCenter. */
export function segmentAngleFromVertical(top: Vec2, bottom: Vec2): number {
  const v = sub(bottom, top);
  return (Math.atan2(v.x, v.y) * 180) / Math.PI;
}

/** Signed rotation difference between two segments (e.g. the shoulder
 * line vs. the hip line), in degrees [-180, 180]. Note this is a 2D,
 * single-camera proxy for what is really a 3D rotation (a golf swing's
 * true shoulder-hip separation, the "X-factor," is a 3D quantity) — see
 * docs/mvp-plan.md's noted risk on monocular accuracy for rotational
 * movements. Treat this as directional/relative signal, not a precise
 * biomechanical angle. */
export function rotationDifferenceDegrees(segmentA: Vec2, segmentB: Vec2): number {
  const cross = segmentA.x * segmentB.y - segmentA.y * segmentB.x;
  const dotProd = dot(segmentA, segmentB);
  return (Math.atan2(cross, dotProd) * 180) / Math.PI;
}

export function midpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function distance(a: Vec2, b: Vec2): number {
  return magnitude(sub(a, b));
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}
