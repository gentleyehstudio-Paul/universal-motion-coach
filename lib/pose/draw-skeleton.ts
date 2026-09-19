import type { CommonSkeletonFrame } from "./types";
import { SKELETON_CONNECTIONS } from "./connections";

/** Draws a CommonSkeletonFrame onto a canvas already sized to the video's
 * displayed dimensions. Landmarks are normalized [0,1]; this is the only
 * place that converts them to pixel space for rendering. */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  frame: CommonSkeletonFrame,
  width: number,
  height: number
): void {
  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 3;
  for (const [a, b] of SKELETON_CONNECTIONS) {
    const pa = frame.joints[a];
    const pb = frame.joints[b];
    if (!pa || !pb) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x * width, pa.y * height);
    ctx.lineTo(pb.x * width, pb.y * height);
    ctx.stroke();
  }

  ctx.fillStyle = "#f97316";
  for (const joint of Object.values(frame.joints)) {
    if (!joint) continue;
    ctx.beginPath();
    ctx.arc(joint.x * width, joint.y * height, 4, 0, 2 * Math.PI);
    ctx.fill();
  }
}
