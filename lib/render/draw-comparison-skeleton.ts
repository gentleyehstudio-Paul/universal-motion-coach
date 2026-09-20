import type { CommonJointId } from "../pose/types";
import type { Point2D } from "../motion/types";
import { SKELETON_CONNECTIONS } from "../pose/connections";

/** Draws one already-spatially-aligned skeleton frame (see
 * spatial-aligner.ts's output — anchor-relative, body-length-scaled) onto
 * a canvas, via the given canvas mapper. Used for both the Ghost Overlay
 * (before + after, opacity-blended) and the Difference View (before as
 * reference). Unlike lib/pose/draw-skeleton.ts (raw per-frame extraction
 * preview), this never clears the canvas itself — callers draw before
 * and after into the same canvas without one erasing the other. */
export function drawComparisonSkeleton(
  ctx: CanvasRenderingContext2D,
  frame: Partial<Record<CommonJointId, Point2D>>,
  mapToCanvas: (p: Point2D) => Point2D,
  options: { jointColor: string; boneColor: string; opacity: number }
): void {
  ctx.globalAlpha = options.opacity;

  ctx.strokeStyle = options.boneColor;
  ctx.lineWidth = 3;
  for (const [a, b] of SKELETON_CONNECTIONS) {
    const pa = frame[a];
    const pb = frame[b];
    if (!pa || !pb) continue;
    const ca = mapToCanvas(pa);
    const cb = mapToCanvas(pb);
    ctx.beginPath();
    ctx.moveTo(ca.x, ca.y);
    ctx.lineTo(cb.x, cb.y);
    ctx.stroke();
  }

  ctx.fillStyle = options.jointColor;
  for (const p of Object.values(frame)) {
    if (!p) continue;
    const c = mapToCanvas(p);
    ctx.beginPath();
    ctx.arc(c.x, c.y, 4, 0, 2 * Math.PI);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

/** Draws a polyline through a joint's positions across a frame range —
 * the "motion trail" feature (docs/mvp-plan.md M6). */
export function drawTrail(
  ctx: CanvasRenderingContext2D,
  points: Point2D[],
  mapToCanvas: (p: Point2D) => Point2D,
  color: string,
  opacity = 0.8
): void {
  if (points.length < 2) return;
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const first = mapToCanvas(points[0]!);
  ctx.moveTo(first.x, first.y);
  for (const p of points.slice(1)) {
    const c = mapToCanvas(p);
    ctx.lineTo(c.x, c.y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Draws an arrowed displacement vector from `from` to `to` (the
 * Difference View's "before landmark --> after landmark" glyph). */
export function drawDisplacementArrow(
  ctx: CanvasRenderingContext2D,
  from: Point2D,
  to: Point2D,
  mapToCanvas: (p: Point2D) => Point2D,
  color: string
): void {
  const a = mapToCanvas(from);
  const b = mapToCanvas(to);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const headLength = 8;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(
    b.x - headLength * Math.cos(angle - Math.PI / 6),
    b.y - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    b.x - headLength * Math.cos(angle + Math.PI / 6),
    b.y - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}
