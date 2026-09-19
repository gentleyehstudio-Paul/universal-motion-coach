"use client";

import { useRef, useState } from "react";
import { notFound } from "next/navigation";
import { getTemplate } from "@/lib/template/registry";
import { CameraGuidance } from "@/components/CameraGuidance";
import { VideoSourcePicker } from "@/components/VideoSourcePicker";
import { PoseTrackedVideo } from "@/components/PoseTrackedVideo";
import { MotionAnalysisPanel } from "@/components/MotionAnalysisPanel";
import { buildMotionSequence } from "@/lib/motion/build-sequence";
import type { MotionSequence } from "@/lib/motion/types";
import type { CommonSkeletonFrame } from "@/lib/pose/types";

export default function RecordPage({
  params,
}: {
  params: { sportId: string };
}) {
  const template = getTemplate(params.sportId);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [sequence, setSequence] = useState<MotionSequence | null>(null);
  const framesRef = useRef<CommonSkeletonFrame[]>([]);

  if (!template) return notFound();

  const handleVideoReady = (src: string) => {
    framesRef.current = [];
    setSequence(null);
    setVideoSrc(src);
  };

  const handlePlaybackEnded = (videoWidth: number, videoHeight: number) => {
    if (framesRef.current.length === 0) return;
    const built = buildMotionSequence({
      id: crypto.randomUUID(),
      sourceVideoRef: null,
      poseProvider: { name: "mediapipe-pose-landmarker", version: "0.10.14", has3D: true },
      videoWidth,
      videoHeight,
      frames: framesRef.current,
    });
    setSequence(built);
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">{template.displayName}</h1>

      <CameraGuidance guidance={template.cameraGuidance} />

      {!videoSrc ? (
        <VideoSourcePicker onVideoReady={handleVideoReady} />
      ) : (
        <div className="flex flex-col gap-3">
          <PoseTrackedVideo
            src={videoSrc}
            onFrame={(frame) => framesRef.current.push(frame)}
            onPlaybackEnded={handlePlaybackEnded}
          />
          <p className="text-xs text-neutral-500">
            Play the clip through to the end to run motion analysis.
          </p>
          <button
            onClick={() => setVideoSrc(null)}
            className="self-start text-sm text-neutral-400 underline hover:text-neutral-200"
          >
            Record or upload a different clip
          </button>
          {sequence && <MotionAnalysisPanel sequence={sequence} template={template} />}
        </div>
      )}
    </main>
  );
}
