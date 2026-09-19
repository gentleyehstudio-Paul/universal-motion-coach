"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import { getTemplate } from "@/lib/template/registry";
import { CameraGuidance } from "@/components/CameraGuidance";
import { VideoSourcePicker } from "@/components/VideoSourcePicker";
import { PoseTrackedVideo } from "@/components/PoseTrackedVideo";

export default function RecordPage({
  params,
}: {
  params: { sportId: string };
}) {
  const template = getTemplate(params.sportId);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);

  if (!template) return notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">{template.displayName}</h1>

      <CameraGuidance guidance={template.cameraGuidance} />

      {!videoSrc ? (
        <VideoSourcePicker onVideoReady={setVideoSrc} />
      ) : (
        <div className="flex flex-col gap-3">
          <PoseTrackedVideo src={videoSrc} />
          <button
            onClick={() => setVideoSrc(null)}
            className="self-start text-sm text-neutral-400 underline hover:text-neutral-200"
          >
            Record or upload a different clip
          </button>
        </div>
      )}
    </main>
  );
}
