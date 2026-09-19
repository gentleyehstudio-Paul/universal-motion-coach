"use client";

import { useEffect, useRef, useState } from "react";
import { MediaPipeProvider } from "@/lib/pose/mediapipe-provider";
import { drawSkeleton } from "@/lib/pose/draw-skeleton";
import type { CommonSkeletonFrame } from "@/lib/pose/types";

interface PoseTrackedVideoProps {
  src: string;
  /** Called once per extracted frame, in playback order. M2 will fold
   * these into a MotionSequence; for M1 this is just an escape hatch. */
  onFrame?: (frame: CommonSkeletonFrame) => void;
}

type Status = "loading_model" | "ready" | "tracking" | "error";

export function PoseTrackedVideo({ src, onFrame }: PoseTrackedVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const providerRef = useRef<MediaPipeProvider | null>(null);
  const frameIndexRef = useRef(0);
  const [status, setStatus] = useState<Status>("loading_model");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const provider = new MediaPipeProvider();
    providerRef.current = provider;

    provider
      .initialize()
      .then(() => {
        if (!cancelled) setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : String(err));
        setStatus("error");
      });

    return () => {
      cancelled = true;
      provider.dispose();
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const provider = providerRef.current;
    if (!video || !canvas || status !== "ready") return;

    let rafId: number;
    let stopped = false;

    const syncCanvasSize = () => {
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
    };

    const loop = async () => {
      if (stopped || video.paused || video.ended) {
        rafId = requestAnimationFrame(loop);
        return;
      }
      syncCanvasSize();
      const ctx = canvas.getContext("2d");
      if (ctx && provider) {
        const frame = await provider.extract(
          video,
          frameIndexRef.current,
          video.currentTime * 1000
        );
        if (frame) {
          drawSkeleton(ctx, frame, canvas.width, canvas.height);
          onFrame?.(frame);
        }
        frameIndexRef.current += 1;
      }
      rafId = requestAnimationFrame(loop);
    };

    setStatus("tracking");
    window.addEventListener("resize", syncCanvasSize);
    rafId = requestAnimationFrame(loop);

    return () => {
      stopped = true;
      window.removeEventListener("resize", syncCanvasSize);
      cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status === "ready"]);

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-black">
      <video
        ref={videoRef}
        src={src}
        controls
        playsInline
        className="w-full"
      />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute left-0 top-0 h-full w-full"
      />
      {status === "loading_model" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-neutral-300">
          Loading pose model…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-center text-sm text-red-400">
          Failed to load pose model: {errorMessage}
        </div>
      )}
    </div>
  );
}
