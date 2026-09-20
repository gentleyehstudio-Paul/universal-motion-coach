"use client";

import { useEffect, useRef, useState } from "react";
import { notFound } from "next/navigation";
import { getTemplate, getRuleSet } from "@/lib/template/registry";
import { CameraGuidance } from "@/components/CameraGuidance";
import { VideoSourcePicker } from "@/components/VideoSourcePicker";
import { PoseTrackedVideo } from "@/components/PoseTrackedVideo";
import { MotionAnalysisPanel } from "@/components/MotionAnalysisPanel";
import { PrimaryCorrectionCard } from "@/components/PrimaryCorrectionCard";
import { AlignmentSummaryPanel } from "@/components/AlignmentSummaryPanel";
import { BeforeAfterComparison } from "@/components/BeforeAfterComparison";
import { analyzeAttempt, type AnalyzedAttempt } from "@/lib/pipeline/analyze-attempt";
import { measureRule } from "@/lib/rules/evaluate";
import { fastApiAlignmentEngine } from "@/lib/alignment/align-client";
import type { AlignmentMap } from "@/lib/alignment/types";
import type { CommonSkeletonFrame } from "@/lib/pose/types";

interface Attempt {
  videoSrc: string;
  result: AnalyzedAttempt;
}

export default function RecordPage({
  params,
}: {
  params: { sportId: string };
}) {
  const template = getTemplate(params.sportId);
  const ruleSet = getRuleSet(params.sportId);

  const [pendingVideoSrc, setPendingVideoSrc] = useState<string | null>(null);
  const [before, setBefore] = useState<Attempt | null>(null);
  const [after, setAfter] = useState<Attempt | null>(null);
  const [alignment, setAlignment] = useState<AlignmentMap | null>(null);
  const [aligning, setAligning] = useState(false);
  const [alignError, setAlignError] = useState<string | null>(null);
  const framesRef = useRef<CommonSkeletonFrame[]>([]);

  useEffect(() => {
    if (!before || !after || alignment || aligning) return;
    setAligning(true);
    setAlignError(null);
    fastApiAlignmentEngine
      .align(before.result.sequence, after.result.sequence)
      .then(setAlignment)
      .catch((err: unknown) => {
        setAlignError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setAligning(false));
  }, [before, after, alignment, aligning]);

  if (!template || !ruleSet) return notFound();

  const startRecording = () => {
    framesRef.current = [];
    setPendingVideoSrc(null);
  };

  const handleVideoReady = (src: string) => {
    framesRef.current = [];
    setPendingVideoSrc(src);
  };

  const handlePlaybackEnded = (stage: "before" | "after") => (
    videoWidth: number,
    videoHeight: number
  ) => {
    if (framesRef.current.length === 0 || !pendingVideoSrc || !template || !ruleSet) return;
    const result = analyzeAttempt(framesRef.current, videoWidth, videoHeight, template, ruleSet);
    const attempt: Attempt = { videoSrc: pendingVideoSrc, result };
    if (stage === "before") {
      setBefore(attempt);
    } else {
      setAfter(attempt);
    }
    setPendingVideoSrc(null);
  };

  const comparisonRule =
    before?.result.primary &&
    ruleSet.evaluationRules.find((r) => r.issueId === before.result.primary!.finding.issueId);
  const comparisonAfterValue =
    comparisonRule && after ? measureRule(after.result.sequence, comparisonRule) : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">{template.displayName}</h1>

      <CameraGuidance guidance={template.cameraGuidance} />

      {/* Stage 1: record "before" */}
      {!before && (
        <>
          {!pendingVideoSrc ? (
            <VideoSourcePicker onVideoReady={handleVideoReady} />
          ) : (
            <div className="flex flex-col gap-3">
              <PoseTrackedVideo
                src={pendingVideoSrc}
                onFrame={(frame) => framesRef.current.push(frame)}
                onPlaybackEnded={handlePlaybackEnded("before")}
              />
              <p className="text-xs text-neutral-500">
                Play the clip through to the end to run motion analysis.
              </p>
              <button
                onClick={startRecording}
                className="self-start text-sm text-neutral-400 underline hover:text-neutral-200"
              >
                Record or upload a different clip
              </button>
            </div>
          )}
        </>
      )}

      {/* Stage 2: show before's result, prompt for "after" */}
      {before && (
        <div className="flex flex-col gap-4">
          <div className="text-sm font-medium text-neutral-300">Before</div>
          {before.result.primary ? (
            <PrimaryCorrectionCard
              finding={before.result.primary.finding}
              correction={before.result.primary.correction}
            />
          ) : (
            <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/20 p-4 text-sm text-emerald-300">
              No issues detected against the rules we currently check for this movement.
            </div>
          )}
          <MotionAnalysisPanel sequence={before.result.sequence} template={template} />

          {!after && (
            <div className="flex flex-col gap-3 border-t border-neutral-800 pt-4">
              <p className="text-sm text-neutral-400">
                Now record your next attempt, keeping the cue above in mind.
              </p>
              {!pendingVideoSrc ? (
                <VideoSourcePicker onVideoReady={handleVideoReady} />
              ) : (
                <div className="flex flex-col gap-3">
                  <PoseTrackedVideo
                    src={pendingVideoSrc}
                    onFrame={(frame) => framesRef.current.push(frame)}
                    onPlaybackEnded={handlePlaybackEnded("after")}
                  />
                  <p className="text-xs text-neutral-500">
                    Play the clip through to the end to run motion analysis.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stage 3: show after's result + alignment */}
      {after && (
        <div className="flex flex-col gap-4 border-t border-neutral-800 pt-4">
          <div className="text-sm font-medium text-neutral-300">After</div>
          <MotionAnalysisPanel sequence={after.result.sequence} template={template} />

          {comparisonRule && comparisonAfterValue !== null && before?.result.primary && (
            <BeforeAfterComparison
              issueLabel={before.result.primary.correction.what}
              phase={comparisonRule.phase}
              unit={comparisonRule.unit}
              beforeValue={before.result.primary.finding.measuredValue}
              afterValue={comparisonAfterValue}
              baselineValue={comparisonRule.baselineValue}
              improved={
                (comparisonRule.comparison === "greater_than"
                  ? comparisonAfterValue - comparisonRule.baselineValue
                  : comparisonRule.baselineValue - comparisonAfterValue) <
                (comparisonRule.comparison === "greater_than"
                  ? before.result.primary.finding.measuredValue - comparisonRule.baselineValue
                  : comparisonRule.baselineValue - before.result.primary.finding.measuredValue)
              }
            />
          )}

          {aligning && <p className="text-sm text-neutral-500">Aligning before/after…</p>}
          {alignError && (
            <p className="text-sm text-red-400">
              Alignment failed: {alignError}. Is the backend running at{" "}
              {process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"}?
            </p>
          )}
          {alignment && <AlignmentSummaryPanel alignment={alignment} />}
        </div>
      )}
    </main>
  );
}
