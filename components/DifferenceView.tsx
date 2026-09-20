"use client";

import { useEffect, useMemo, useRef } from "react";
import type { MotionSequence } from "@/lib/motion/types";
import type { AlignmentMap } from "@/lib/alignment/types";
import { normalizeSpatially, type AnchorKind } from "@/lib/motion/spatial-aligner";
import { resolveAfterFrame } from "@/lib/alignment/resolve-after-frame";
import {
  drawComparisonSkeleton,
  drawDisplacementArrow,
} from "@/lib/render/draw-comparison-skeleton";
import { DEFAULT_CANVAS_MAPPING, makeCanvasMapper } from "@/lib/render/coordinate-mapping";
import type { CommonJointId } from "@/lib/pose/types";

export interface Measurement {
  label: string;
  beforeValue: number;
  afterValue: number;
  unit: "degrees" | "seconds" | "ratio" | "normalized_distance";
}

interface DifferenceViewProps {
  before: MotionSequence;
  after: MotionSequence;
  alignment: AlignmentMap;
  anchor: AnchorKind;
  rotationNormalization: boolean;
  beforeFrame: number;
  keyJoints: CommonJointId[];
  measurements: Measurement[];
}

function unitSuffix(unit: Measurement["unit"]): string {
  return unit === "degrees" ? "°" : ` ${unit}`;
}

/**
 * The product's other non-negotiable V0 view (docs/mvp-plan.md M6): a
 * single representative moment, before skeleton as reference, with a
 * displacement vector per key joint to "before landmark --> after
 * landmark," plus the numeric deltas that vector represents.
 */
export function DifferenceView({
  before,
  after,
  alignment,
  anchor,
  rotationNormalization,
  beforeFrame,
  keyJoints,
  measurements,
}: DifferenceViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapToCanvas = useMemo(() => makeCanvasMapper(), []);

  const beforeSpatial = useMemo(
    () => normalizeSpatially(before, anchor, rotationNormalization),
    [before, anchor, rotationNormalization]
  );
  const afterSpatial = useMemo(
    () => normalizeSpatially(after, anchor, rotationNormalization),
    [after, anchor, rotationNormalization]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const beforeSkeleton = beforeSpatial.frames[beforeFrame];
    const afterFrameIndex = resolveAfterFrame(alignment, beforeFrame);
    const afterSkeleton = afterFrameIndex !== null ? afterSpatial.frames[afterFrameIndex] : null;
    if (!beforeSkeleton) return;

    drawComparisonSkeleton(ctx, beforeSkeleton, mapToCanvas, {
      jointColor: "#a3a3a3",
      boneColor: "#525252",
      opacity: 0.8,
    });

    if (afterSkeleton) {
      for (const joint of keyJoints) {
        const from = beforeSkeleton[joint];
        const to = afterSkeleton[joint];
        if (!from || !to) continue;
        drawDisplacementArrow(ctx, from, to, mapToCanvas, "#f97316");
      }
    }
  }, [beforeFrame, beforeSpatial, afterSpatial, alignment, keyJoints, mapToCanvas]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="flex justify-center rounded-lg bg-black">
        <canvas
          ref={canvasRef}
          width={DEFAULT_CANVAS_MAPPING.width}
          height={DEFAULT_CANVAS_MAPPING.height}
        />
      </div>
      <div className="flex flex-col gap-2 text-sm">
        {measurements.map((m) => (
          <div key={m.label}>
            <div className="text-neutral-400">{m.label}</div>
            <div className="text-neutral-200">
              Before: {m.beforeValue.toFixed(1)}
              {unitSuffix(m.unit)} → After: {m.afterValue.toFixed(1)}
              {unitSuffix(m.unit)}{" "}
              <span className={m.afterValue < m.beforeValue ? "text-emerald-400" : "text-amber-400"}>
                ({m.afterValue - m.beforeValue >= 0 ? "+" : ""}
                {(m.afterValue - m.beforeValue).toFixed(1)}
                {unitSuffix(m.unit)})
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
