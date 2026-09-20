"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MotionSequence } from "@/lib/motion/types";
import type { AlignmentMap } from "@/lib/alignment/types";
import { normalizeSpatially, type AnchorKind } from "@/lib/motion/spatial-aligner";
import { resolveAfterFrame } from "@/lib/alignment/resolve-after-frame";
import {
  drawComparisonSkeleton,
  drawTrail,
} from "@/lib/render/draw-comparison-skeleton";
import { DEFAULT_CANVAS_MAPPING, makeCanvasMapper } from "@/lib/render/coordinate-mapping";
import type { CommonJointId } from "@/lib/pose/types";

interface GhostOverlayViewProps {
  before: MotionSequence;
  after: MotionSequence;
  alignment: AlignmentMap;
  anchor: AnchorKind;
  rotationNormalization: boolean;
  trailJoints?: CommonJointId[];
}

const PLAYBACK_RATES = [0.25, 0.5, 1] as const;

/**
 * The product's primary feature (docs/mvp-plan.md M6): before + after
 * skeletons rendered in the same coordinate system, with an opacity
 * slider between them and play/pause/scrub/frame-step/slow-motion
 * controls. Uses SpatialAligner's output directly (already anchor-
 * relative and body-length-scaled — see docs/architecture.md SS3.7) and
 * AlignmentMap to keep before/after in sync despite different tempos.
 */
export function GhostOverlayView({
  before,
  after,
  alignment,
  anchor,
  rotationNormalization,
  trailJoints,
}: GhostOverlayViewProps) {
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

  const lastFrame = before.frameCount - 1;
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [afterOpacity, setAfterOpacity] = useState(0.65);
  const [showTrails, setShowTrails] = useState(false);

  const currentFrameRef = useRef(currentFrame);
  currentFrameRef.current = currentFrame;

  useEffect(() => {
    if (!playing) return;
    let rafId: number;
    let lastTime: number | null = null;
    let fractionalFrame = currentFrameRef.current;

    const tick = (time: number) => {
      if (lastTime !== null) {
        const dtSec = (time - lastTime) / 1000;
        fractionalFrame += dtSec * before.fps * playbackRate;
        if (fractionalFrame > lastFrame) fractionalFrame = 0; // loop
        setCurrentFrame(Math.floor(fractionalFrame));
      }
      lastTime = time;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing, playbackRate, before.fps, lastFrame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const afterFrameIndex = resolveAfterFrame(alignment, currentFrame);

    if (showTrails && trailJoints) {
      const phase = before.phases.find((p) => currentFrame >= p.startFrame && currentFrame <= p.endFrame);
      const range = phase ?? { startFrame: 0, endFrame: lastFrame };
      const fallbackAfterRange: [number, number] = [0, after.frameCount - 1];
      const afterRange: [number, number] =
        afterFrameIndex !== null
          ? alignment.phaseAlignment.find((p) => p.phaseName === phase?.name)?.afterRange ??
            fallbackAfterRange
          : fallbackAfterRange;

      for (const joint of trailJoints) {
        const beforePts = beforeSpatial.frames
          .slice(range.startFrame, range.endFrame + 1)
          .map((f) => f[joint])
          .filter((p): p is NonNullable<typeof p> => p != null);
        const afterPts = afterSpatial.frames
          .slice(afterRange[0], afterRange[1] + 1)
          .map((f) => f[joint])
          .filter((p): p is NonNullable<typeof p> => p != null);
        drawTrail(ctx, beforePts, mapToCanvas, "#22d3ee", 0.5);
        drawTrail(ctx, afterPts, mapToCanvas, "#f97316", 0.5);
      }
    }

    const beforeFrame = beforeSpatial.frames[currentFrame];
    if (beforeFrame) {
      drawComparisonSkeleton(ctx, beforeFrame, mapToCanvas, {
        jointColor: "#22d3ee",
        boneColor: "#22d3ee",
        opacity: 0.9,
      });
    }
    if (afterFrameIndex !== null) {
      const afterFrame = afterSpatial.frames[afterFrameIndex];
      if (afterFrame) {
        drawComparisonSkeleton(ctx, afterFrame, mapToCanvas, {
          jointColor: "#f97316",
          boneColor: "#f97316",
          opacity: afterOpacity,
        });
      }
    }
  }, [
    currentFrame,
    afterOpacity,
    showTrails,
    beforeSpatial,
    afterSpatial,
    alignment,
    trailJoints,
    before.phases,
    before.fps,
    after.frameCount,
    lastFrame,
    mapToCanvas,
  ]);

  const step = (delta: number) => {
    setPlaying(false);
    setCurrentFrame((f) => Math.min(lastFrame, Math.max(0, f + delta)));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-center rounded-lg bg-black">
        <canvas
          ref={canvasRef}
          width={DEFAULT_CANVAS_MAPPING.width}
          height={DEFAULT_CANVAS_MAPPING.height}
        />
      </div>

      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setPlaying((p) => !p)}
          className="rounded bg-neutral-800 px-3 py-1 hover:bg-neutral-700"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button onClick={() => step(-1)} className="rounded bg-neutral-800 px-2 py-1 hover:bg-neutral-700">
          -1
        </button>
        <button onClick={() => step(1)} className="rounded bg-neutral-800 px-2 py-1 hover:bg-neutral-700">
          +1
        </button>
        <select
          value={playbackRate}
          onChange={(e) => setPlaybackRate(Number(e.target.value))}
          className="rounded bg-neutral-800 px-2 py-1"
        >
          {PLAYBACK_RATES.map((rate) => (
            <option key={rate} value={rate}>
              {rate}x
            </option>
          ))}
        </select>
        <span className="text-neutral-500">
          frame {currentFrame}/{lastFrame}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={lastFrame}
        value={currentFrame}
        onChange={(e) => {
          setPlaying(false);
          setCurrentFrame(Number(e.target.value));
        }}
        className="w-full"
      />

      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <span>Before</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={afterOpacity}
          onChange={(e) => setAfterOpacity(Number(e.target.value))}
          className="flex-1"
        />
        <span>After</span>
      </div>

      {trailJoints && trailJoints.length > 0 && (
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          <input
            type="checkbox"
            checked={showTrails}
            onChange={(e) => setShowTrails(e.target.checked)}
          />
          Show motion trails ({trailJoints.join(", ")})
        </label>
      )}
    </div>
  );
}
