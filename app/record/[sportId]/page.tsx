"use client";

import { useRef, useState } from "react";
import { notFound } from "next/navigation";
import { getTemplate, getRuleSet } from "@/lib/template/registry";
import { CameraGuidance } from "@/components/CameraGuidance";
import { VideoSourcePicker } from "@/components/VideoSourcePicker";
import { PoseTrackedVideo } from "@/components/PoseTrackedVideo";
import { MotionAnalysisPanel } from "@/components/MotionAnalysisPanel";
import { PrimaryCorrectionCard } from "@/components/PrimaryCorrectionCard";
import { buildMotionSequence } from "@/lib/motion/build-sequence";
import { detectPhases } from "@/lib/motion/phase-detector";
import { evaluateRules } from "@/lib/rules/evaluate";
import { selectPrimaryFinding } from "@/lib/rules/select-primary";
import { generateCorrection } from "@/lib/correction/generate";
import type { MotionSequence, Correction, Finding } from "@/lib/motion/types";
import type { CommonSkeletonFrame } from "@/lib/pose/types";

export default function RecordPage({
  params,
}: {
  params: { sportId: string };
}) {
  const template = getTemplate(params.sportId);
  const ruleSet = getRuleSet(params.sportId);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [sequence, setSequence] = useState<MotionSequence | null>(null);
  const [primary, setPrimary] = useState<{ finding: Finding; correction: Correction } | null>(
    null
  );
  const framesRef = useRef<CommonSkeletonFrame[]>([]);

  if (!template || !ruleSet) return notFound();

  const handleVideoReady = (src: string) => {
    framesRef.current = [];
    setSequence(null);
    setPrimary(null);
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
    const withPhases = { ...built, phases: detectPhases(built, template) };
    setSequence(withPhases);

    const findings = evaluateRules(withPhases, ruleSet.evaluationRules);
    const primaryFinding = selectPrimaryFinding(findings);
    if (primaryFinding) {
      const correctionTemplate = ruleSet.corrections[primaryFinding.issueId];
      if (correctionTemplate) {
        setPrimary({
          finding: primaryFinding,
          correction: generateCorrection(primaryFinding, correctionTemplate),
        });
      }
    } else {
      setPrimary(null);
    }
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

          {sequence && primary && (
            <PrimaryCorrectionCard finding={primary.finding} correction={primary.correction} />
          )}
          {sequence && !primary && (
            <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/20 p-4 text-sm text-emerald-300">
              No issues detected against the rules we currently check for this movement.
            </div>
          )}

          {sequence && <MotionAnalysisPanel sequence={sequence} template={template} />}
        </div>
      )}
    </main>
  );
}
