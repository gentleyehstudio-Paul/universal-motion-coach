"use client";

import { useEffect, useRef, useState } from "react";
import { MediaPipeProvider } from "@/lib/pose/mediapipe-provider";
import { drawSkeleton } from "@/lib/pose/draw-skeleton";
import type { CommonSkeletonFrame } from "@/lib/pose/types";

interface PoseTrackedVideoProps {
  src: string;
  /** Called once per extracted frame, in playback order. */
  onFrame?: (frame: CommonSkeletonFrame) => void;
  /** Called when playback reaches the end, with the source video's
   * natural (not display) pixel dimensions — needed for aspect-correct
   * angle math in buildMotionSequence. Fires once per full playthrough. */
  onPlaybackEnded?: (videoWidth: number, videoHeight: number) => void;
}

type Status = "loading_model" | "ready" | "tracking" | "error";

export function PoseTrackedVideo({ src, onFrame, onPlaybackEnded }: PoseTrackedVideoProps) {
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
    // MediaPipe's detectForVideo requires a strictly increasing timestamp
    // between calls, or it throws. requestAnimationFrame can fire faster
    // than video.currentTime actually advances (especially early in
    // playback, or on variable-frame-rate phone-recorded footage), which
    // produces a repeated or non-increasing timestamp and — without this
    // guard — silently kills the whole extraction loop for the rest of
    // the clip the first time it happens (an uncaught rejection inside
    // this async function means the trailing requestAnimationFrame call
    // never runs), which looked like "playing the video does nothing."
    let lastTimestampMs = -1;

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
      const timestampMs = video.currentTime * 1000;
      if (ctx && provider && timestampMs > lastTimestampMs) {
        lastTimestampMs = timestampMs;
        try {
          const frame = await provider.extract(video, frameIndexRef.current, timestampMs);
          if (frame) {
            drawSkeleton(ctx, frame, canvas.width, canvas.height);
            onFrame?.(frame);
          }
          frameIndexRef.current += 1;
        } catch (err) {
          console.error("Pose extraction failed for a frame, skipping:", err);
        }
      }
      rafId = requestAnimationFrame(loop);
    };

    const handleEnded = () => {
      onPlaybackEnded?.(video.videoWidth, video.videoHeight);
    };

    setStatus("tracking");
    window.addEventListener("resize", syncCanvasSize);
    video.addEventListener("ended", handleEnded);
    rafId = requestAnimationFrame(loop);

    return () => {
      stopped = true;
      window.removeEventListener("resize", syncCanvasSize);
      video.removeEventListener("ended", handleEnded);
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
